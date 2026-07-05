import {
	type AbsoluteDateRange,
	buildReportFrontMatter,
	createReportInputSchema,
	createReportShareInputSchema,
	filterEntriesByTags,
	generateShareToken,
	listReportsQuerySchema,
	MAX_REPORT_MARKDOWN_LENGTH,
	MAX_REPORT_WORKSPACES,
	previewReportInputSchema,
	type ReportContextInput,
	type ReportFilters,
	type ReportFiltersInput,
	renderReport,
	resolveDateRange,
	resolveUserTimezone,
	sendReportInputSchema,
	updateReportInputSchema,
} from "@spantail/core";
import {
	createReport,
	createReportDeliveries,
	createReportShare,
	deleteReport,
	getCurrentReportContent,
	getMembership,
	getReportById,
	getReportTemplateById,
	listMembers,
	listMembersByProject,
	listMembersInAllWorkspaces,
	listProjectsByIds,
	listReportMetaByOwner,
	listReportMetaByWorkspace,
	listReportSendsByReport,
	listReportSharesByReport,
	listReportTemplateIdsByOwner,
	listUsersByIds,
	listWorkEntriesForReport,
	listWorkspaceMemberIds,
	listWorkspacesForUser,
	type ReportRow,
	updateReportWithNewVersion,
} from "@spantail/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { resolveAvatarUrl } from "../lib/avatar";
import { AppError } from "../lib/errors";
import { parseOptionalJsonBody } from "../lib/json";
import {
	isWorkspaceAdmin,
	type MemberWorkspace,
	requireScopeWorkspaces,
	resolveAdminListScope,
	resolveEntryAccessForWorkspaces,
} from "../lib/permissions";
import { shareAttributesFromInput, toApiShare } from "../lib/share-api";
import { validate } from "../lib/validate";
import { requireAuth, requireScope } from "../middleware/auth";
import { publishToUsers } from "../realtime/publish";
import type { AppEnv } from "../types";

/** Owner-only access; existence is not revealed to other users. */
export async function requireReportOwner(
	c: Context<AppEnv>,
	id: string,
): Promise<ReportRow> {
	const { user } = requireAuth(c);
	const report = await getReportById(c.var.db, id);
	if (!report || report.ownerUserId !== user.id) {
		throw new AppError("not_found", "Report not found");
	}
	return report;
}

/**
 * Read access to a report (docs/permissions.md Access matrix): the owner, an
 * instance admin (full `R`), or a workspace admin/owner of the report's single
 * workspace (`R*` — only when the report is scoped to exactly one workspace; a
 * multi-workspace report is not a per-workspace partial view, so it stays
 * instance-admin-only). Anyone else gets 404 — existence is never revealed.
 * Write routes keep requireReportOwner (owner-only).
 */
export async function requireReportReadAccess(
	c: Context<AppEnv>,
	id: string,
): Promise<ReportRow> {
	const { user } = requireAuth(c);
	const report = await getReportById(c.var.db, id);
	if (!report) throw new AppError("not_found", "Report not found");
	if (report.ownerUserId === user.id || user.isAdmin) return report;
	const [workspaceId] = report.filters.workspaceIds;
	if (report.filters.workspaceIds.length === 1 && workspaceId) {
		const membership = await getMembership(c.var.db, workspaceId, user.id);
		if (membership && isWorkspaceAdmin(membership.role)) return report;
	}
	throw new AppError("not_found", "Report not found");
}

/**
 * Cross-workspace filters are limited to the union of the caller's
 * memberships. Templates are instance-scoped formats, independent of the
 * report's scope, so any template may back any scope. Returns the caller's
 * memberships, the template body to render with (baked into the document), and
 * whether the template is enabled.
 */
async function validateFiltersAndTemplate(
	c: Context<AppEnv>,
	workspaceIds: string[],
	templateId: string,
): Promise<{
	workspaces: MemberWorkspace[];
	template: NonNullable<Awaited<ReturnType<typeof getReportTemplateById>>>;
}> {
	const workspaces = await requireScopeWorkspaces(c, workspaceIds);
	const template = await getReportTemplateById(c.var.db, templateId);
	if (!template) throw new AppError("not_found", "Report template not found");
	return { workspaces, template };
}

/**
 * Renders a template's initial name/note Liquid against a composed report's
 * scope context (the same context as the body). Returns "" when the field has
 * no template; a broken field template yields "" rather than failing the
 * preview, and the result is clamped to the column's max length.
 */
async function renderReportField(
	template: string | null,
	context: ReportContextInput,
	maxLength: number,
): Promise<string> {
	if (!template) return "";
	try {
		const rendered = await renderReport(template, context);
		return rendered.trim().slice(0, maxLength);
	} catch {
		return "";
	}
}

/** Blank notes collapse to null so templates can truth-test them. */
function normalizeNote(note: string | null): string | null {
	return note && note.trim() !== "" ? note : null;
}

/**
 * Assembles the API report payload from a header row and a content version: the
 * report's current rendered document is the latest content (front-matter + body).
 * Date columns serialize to ISO strings via the JSON response (matching the
 * `Report` wire shape), so the header row is spread as-is.
 */
function toApiReport(report: ReportRow, content: string) {
	return { ...report, renderedMarkdown: content };
}

/**
 * Validates membership + template, resolves the period to absolute dates, and
 * renders the document synchronously: a system-generated YAML front-matter
 * header (provenance) followed by the Liquid-rendered body. A template error
 * surfaces as a 400 so a create/edit never persists an un-renderable report.
 */
async function renderReportDocument(
	c: Context<AppEnv>,
	doc: {
		name: string;
		templateId: string;
		filters: ReportFiltersInput;
		note: string | null;
		// The version this render will become; baked into the front-matter.
		version: number;
	},
): Promise<{
	content: string;
	resolvedFilters: ReportFilters;
	totalMinutes: number;
	entryCount: number;
	projectCount: number;
	// Distinct project ids present in this snapshot — persisted to drive the
	// Send-to ACL against the frozen content rather than re-querying live entries.
	projectIds: string[];
	// The workspace set this snapshot was rendered against (the resolved instance
	// scope, or the single selected workspace). Persisted as `snapshotWorkspaceIds`
	// to bound the Send-to / share ACL to the frozen scope, since the stored filter
	// keeps the empty set for instance scope.
	snapshotWorkspaceIds: string[];
	// The rendered body's scope context and the template's name/note Liquid, so
	// the preview can render the initial name/note suggestions against the same
	// context without re-resolving the scope.
	context: ReportContextInput;
	nameTemplate: string | null;
	noteTemplate: string | null;
}> {
	const { filters, templateId } = doc;
	// Project ACL: the report owner sees project-assigned entries only for the
	// projects they belong to (admins see all in their workspaces). Snapshots are
	// point-in-time — this is enforced at render, not on stored content.
	const { user } = requireAuth(c);
	// A single-workspace scope filters to that workspace; an empty selection means
	// instance scope. Instance scope is owner-scoped (see userIds below), so the
	// workspace set is not part of the report's identity — it is resolved here to
	// the caller's memberships only to bound the entry query, and NOT persisted
	// (the stored filter keeps the empty set, so it never records a stale
	// membership snapshot; only the entries, which are the owner's own, matter).
	const instanceScope = filters.workspaceIds.length === 0;
	const workspaceIds = instanceScope
		? (await listWorkspacesForUser(c.var.db, user.id)).map((w) => w.id)
		: filters.workspaceIds;
	if (workspaceIds.length === 0) {
		throw new AppError("bad_request", "You do not belong to any workspace");
	}
	// Instance scope resolves from live memberships, which bypass the wire schema;
	// enforce the stored cap here so a user in too many workspaces can't persist a
	// filter that violates the ReportFilters contract (or a runaway query).
	if (workspaceIds.length > MAX_REPORT_WORKSPACES) {
		throw new AppError("bad_request", "Report spans too many workspaces");
	}
	const { workspaces, template } = await validateFiltersAndTemplate(
		c,
		workspaceIds,
		templateId,
	);
	// A disabled (archived) template can't back a new or edited report; existing
	// reports stay viewable/shareable, only re-rendering is blocked.
	if (!template.enabled) {
		throw new AppError("bad_request", "Report template is disabled");
	}

	const scoped = workspaces.filter((w) => workspaceIds.includes(w.id));
	// Invariant: the validated memberships always cover the resolved scope.
	if (!scoped.some((w) => w.id === workspaceIds[0])) {
		throw new AppError("internal", "Filter workspace missing");
	}

	// The report renders in the running user's timezone: relative ranges and the
	// generation date resolve in it. Entries are already bucketed by their stored
	// local date, so grouping itself needs no timezone.
	const timezone = resolveUserTimezone(user.timezone);
	const range: AbsoluteDateRange = resolveDateRange(
		filters.dateRange,
		timezone,
	);
	const access = resolveEntryAccessForWorkspaces(scoped, user.id);
	// Reports are scoped to the owner's own work by default. The web UI never
	// sends userIds, so it always renders own-only — an instance-scope report
	// still spans every workspace, but includes only the caller's entries. The
	// API can pass explicit userIds for a cross-user report (still bounded by
	// `access`).
	const userIds = filters.userIds?.length ? filters.userIds : [user.id];
	const rows = await listWorkEntriesForReport(c.var.db, {
		workspaceIds,
		projectIds: filters.projectIds,
		userIds,
		from: range.from,
		to: range.to,
		access,
	});
	const entries = filterEntriesByTags(rows, filters.tags);
	const [projects, users] = await Promise.all([
		listProjectsByIds(c.var.db, [
			...new Set(entries.flatMap((e) => (e.projectId ? [e.projectId] : []))),
		]),
		listUsersByIds(c.var.db, [...new Set(entries.map((e) => e.userId))]),
	]);

	const preset =
		typeof filters.dateRange === "string" ? filters.dateRange : null;
	// One timestamp shared by the rendered body and the front-matter header.
	const generatedAt = new Date();
	const context: ReportContextInput = {
		report: { name: doc.name, note: doc.note },
		user: { name: user.name },
		period: { ...range, preset },
		timezone,
		generatedAt,
		workspaces: scoped.map((w) => ({
			id: w.id,
			slug: w.slug,
			name: w.name,
		})),
		projects,
		users: users.map((u) => ({ id: u.id, name: u.name })),
		entries,
	};
	let body: string;
	try {
		body = await renderReport(template.body, context);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new AppError("bad_request", `Template rendering failed: ${message}`);
	}

	const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

	// System-generated provenance header. Built here (not in the template) so it
	// is consistent and never under user/template control. Note is excluded — it
	// is long/free-form and lives in the body + as a column.
	const frontMatter = buildReportFrontMatter({
		name: doc.name,
		version: doc.version,
		templateId,
		period: { from: range.from, to: range.to, preset },
		filters: {
			// Instance scope stores the empty set: it is owner-scoped, so the
			// resolved membership set is a query detail, not part of the snapshot.
			workspaceIds: instanceScope ? [] : workspaceIds,
			...(filters.projectIds?.length ? { projectIds: filters.projectIds } : {}),
			...(filters.userIds?.length ? { userIds: filters.userIds } : {}),
			...(filters.tags?.length ? { tags: filters.tags } : {}),
		},
		totalMinutes,
		timezone,
		generatedAt: generatedAt.toISOString(),
	});
	const content = frontMatter + body;
	if (content.length > MAX_REPORT_MARKDOWN_LENGTH) {
		throw new AppError("bad_request", "Rendered report is too large");
	}

	return {
		content,
		resolvedFilters: {
			...filters,
			workspaceIds: instanceScope ? [] : workspaceIds,
			dateRange: range,
		},
		totalMinutes,
		entryCount: entries.length,
		// Distinct projects with at least one entry (entries with no project are
		// excluded, mirroring how they group under "(no project)" in the body).
		projectCount: projects.length,
		projectIds: projects.map((p) => p.id),
		snapshotWorkspaceIds: workspaceIds,
		context,
		nameTemplate: template.nameTemplate,
		noteTemplate: template.noteTemplate,
	};
}

/**
 * The workspace set a report's snapshot was rendered against — the basis for
 * every membership gate on the report (read, edit, list redaction, send/share)
 * and for the recipient pool. It is the frozen `snapshotWorkspaceIds`, since
 * instance scope stores an empty `filters.workspaceIds`; it falls back to the
 * stored filter for legacy reports that predate the snapshot column (their
 * filter holds the resolved set). Gating on the frozen scope keeps access stable
 * against later membership changes and correct for cross-user snapshots (which
 * are not own-only), so losing membership in a rendered workspace still revokes.
 */
function frozenReportScope(report: ReportRow): string[] {
	return report.snapshotWorkspaceIds ?? report.filters.workspaceIds;
}

/**
 * Candidate recipients for a report's "Send to": members of all the report's
 * workspaces who can also read its project-scoped content. A delivered snapshot
 * is a frozen copy that bypasses the live read ACL, so a recipient must already
 * be able to read every project that appears in the snapshot — a workspace
 * admin/owner reads any project, otherwise the recipient must be a member of
 * each. The project set is the one captured at render time
 * (`report.snapshotProjectIds`), not a re-query of live entries, so it stays
 * correct even if the owner later loses access or the entries change. Reports
 * with only unassigned/own entries impose no project restriction. A null
 * `snapshotProjectIds` means the report predates this capture (unknown scope):
 * no one is eligible until it is re-rendered, since the frozen body may hold
 * project-scoped data we can't enumerate.
 */
async function reportRecipientCandidates(
	c: Context<AppEnv>,
	report: ReportRow,
	senderId: string,
): Promise<
	Array<{ id: string; name: string; email: string; image: string | null }>
> {
	const snapshotProjectIds = report.snapshotProjectIds;
	if (snapshotProjectIds === null) return [];

	// The recipient pool is bounded by the frozen render scope, not live
	// memberships: an instance-scope report stores an empty `filters.workspaceIds`,
	// so deriving it live would let the pool drift as the owner's memberships
	// change (and leak snapshot data to members outside the rendered scope).
	const workspaceIds = frozenReportScope(report);

	const base = await listMembersInAllWorkspaces(
		c.var.db,
		workspaceIds,
		senderId,
	);
	if (snapshotProjectIds.length === 0) return base;

	const projects = await listProjectsByIds(c.var.db, snapshotProjectIds);
	const projectWorkspace = new Map(projects.map((p) => [p.id, p.workspaceId]));
	const adminsByWorkspace = new Map<string, Set<string>>();
	const membersByProject = new Map<string, Set<string>>();
	for (const wsId of workspaceIds) {
		const ms = await listMembers(c.var.db, wsId);
		adminsByWorkspace.set(
			wsId,
			new Set(
				ms
					.filter((m) => m.role === "owner" || m.role === "admin")
					.map((m) => m.userId),
			),
		);
		for (const row of await listMembersByProject(c.var.db, wsId)) {
			const set = membersByProject.get(row.projectId) ?? new Set<string>();
			set.add(row.userId);
			membersByProject.set(row.projectId, set);
		}
	}

	const canRead = (userId: string) =>
		snapshotProjectIds.every((pid) => {
			const wsId = projectWorkspace.get(pid);
			if (wsId && adminsByWorkspace.get(wsId)?.has(userId)) return true;
			return membersByProject.get(pid)?.has(userId) ?? false;
		});

	return base.filter((m) => canRead(m.id));
}

export const reportRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		// Admin reads are addressed by ?ownerUserId (instance admin, full R) or
		// ?workspaceId (workspace admin, R* — single-workspace reports only);
		// otherwise the caller reads their own.
		const scope = await resolveAdminListScope(c, {
			ownerUserId: c.req.query("ownerUserId"),
			workspaceId: c.req.query("workspaceId"),
		});
		const query = validate(listReportsQuerySchema, c.req.query());
		// Metadata only: the rendered body is fetched on demand via GET /:id.
		if (scope.kind === "workspace") {
			return c.json(
				await listReportMetaByWorkspace(c.var.db, scope.workspaceId, query),
			);
		}
		if (scope.kind === "user") {
			// Instance admin sees the user's full set (no membership redaction).
			return c.json(
				await listReportMetaByOwner(c.var.db, scope.ownerUserId, query),
			);
		}
		const metas = await listReportMetaByOwner(c.var.db, scope.userId, query);
		// totalMinutes is an aggregate of workspace entries (report content), so it
		// is redacted for reports whose frozen render scope the owner no longer fully
		// covers — mirroring the frozen-scope membership re-check that gates the full
		// report read (instance scope stores an empty filter, so use the frozen set).
		const memberIds = new Set(
			(await listWorkspacesForUser(c.var.db, scope.userId)).map((w) => w.id),
		);
		return c.json(
			metas.map((report) =>
				frozenReportScope(report).every((id) => memberIds.has(id))
					? report
					: { ...report, totalMinutes: null },
			),
		);
	})
	// Static segment registered before "/:id" so it never matches it. Lets the
	// sidebar surface archived-template tabs without loading every report.
	.get("/template-ids", async (c) => {
		const { user } = requireScope(c, "read");
		return c.json(await listReportTemplateIdsByOwner(c.var.db, user.id));
	})
	// Renders without persisting: the compose dialog's live preview. Read scope
	// is enough (no write happens) but it runs the full membership/template
	// validation and render so the preview matches what create/edit would store.
	.post("/preview", async (c) => {
		requireScope(c, "read");
		// name is optional here: at compose time the initial name comes from the
		// template's name Liquid, which this preview renders and returns.
		const input = validate(previewReportInputSchema, await c.req.json());
		const {
			content,
			totalMinutes,
			entryCount,
			projectCount,
			context,
			nameTemplate,
			noteTemplate,
		} = await renderReportDocument(c, {
			name: input.name ?? "",
			templateId: input.templateId,
			filters: input.filters,
			note: normalizeNote(input.note ?? null),
			// Cosmetic for a preview (the front-matter version line is stripped on
			// display); the persisted version is assigned on create/edit.
			version: 1,
		});
		// Initial name/note the compose form adopts until the user edits them.
		let suggestedName = "";
		let suggestedNote = "";
		if (nameTemplate || noteTemplate) {
			// The name/note Liquid is scope-derived, so its projects/users are the
			// *selected* filter (resolved by id), not the body's entry-derived set —
			// otherwise a project/user with no entries in the period would render as
			// missing. Lookups are constrained to the authorized scope (projects to
			// the resolved workspaces, users to their members) so a crafted request
			// can't leak a name from a workspace the caller can't see. The report is
			// blanked so the suggestion never depends on the in-progress name/note:
			// the form can echo the adopted name back (so the body preview shows it)
			// without the suggestion drifting each round trip.
			const authorizedWsIds = new Set(context.workspaces.map((w) => w.id));
			const projectIds = input.filters.projectIds ?? [];
			const userIds = input.filters.userIds ?? [];
			const [projectRows, userRows, memberIdLists] = await Promise.all([
				projectIds.length
					? listProjectsByIds(c.var.db, projectIds)
					: Promise.resolve([]),
				userIds.length
					? listUsersByIds(c.var.db, userIds)
					: Promise.resolve([]),
				userIds.length
					? Promise.all(
							[...authorizedWsIds].map((id) =>
								listWorkspaceMemberIds(c.var.db, id),
							),
						)
					: Promise.resolve([] as string[][]),
			]);
			const memberIds = new Set(memberIdLists.flat());
			const fieldContext: ReportContextInput = {
				...context,
				report: { name: "", note: null },
				projects: projectRows
					.filter((p) => authorizedWsIds.has(p.workspaceId))
					.map((p) => ({
						id: p.id,
						slug: p.slug,
						name: p.name,
						workspaceId: p.workspaceId,
					})),
				users: userRows
					.filter((u) => memberIds.has(u.id))
					.map((u) => ({ id: u.id, name: u.name })),
				entries: [],
			};
			suggestedName = await renderReportField(nameTemplate, fieldContext, 100);
			suggestedNote = await renderReportField(
				noteTemplate,
				fieldContext,
				20000,
			);
		}
		return c.json({
			content,
			totalMinutes,
			entryCount,
			projectCount,
			suggestedName,
			suggestedNote,
		});
	})
	.post("/", async (c) => {
		const { user } = requireScope(c, "write");
		const input = validate(createReportInputSchema, await c.req.json());
		const note = normalizeNote(input.note ?? null);
		const {
			content,
			resolvedFilters,
			totalMinutes,
			projectIds,
			snapshotWorkspaceIds,
		} = await renderReportDocument(c, {
			name: input.name,
			templateId: input.templateId,
			filters: input.filters,
			note,
			version: 1,
		});
		const { report, content: contentRow } = await createReport(c.var.db, {
			name: input.name,
			ownerUserId: user.id,
			templateId: input.templateId,
			filters: resolvedFilters,
			note,
			totalMinutes,
			snapshotProjectIds: projectIds,
			snapshotWorkspaceIds,
			content,
		});
		return c.json(toApiReport(report, contentRow.content), 201);
	})
	.get("/:id", async (c) => {
		const { user } = requireScope(c, "read");
		const report = await requireReportReadAccess(c, c.req.param("id"));
		// For the owner, the rendered markdown is workspace data: losing membership
		// in any rendered workspace revokes access to the content. Admin readers are
		// already authorized by requireReportReadAccess and need not be members, so
		// the membership re-check applies to the owner path only. Gated on the frozen
		// render scope (instance scope stores an empty filter), so a cross-user
		// snapshot — which is not own-only — stays gated after membership changes.
		if (report.ownerUserId === user.id) {
			await requireScopeWorkspaces(c, frozenReportScope(report));
		}
		const current = await getCurrentReportContent(c.var.db, report.id);
		if (!current) throw new AppError("internal", "Report content missing");
		return c.json(toApiReport(report, current.content));
	})
	.patch("/:id", async (c) => {
		requireScope(c, "write");
		const report = await requireReportOwner(c, c.req.param("id"));
		// The response carries the rendered body (workspace data), and the edit
		// re-renders it, so losing membership in any rendered workspace revokes
		// editing too — the same frozen-scope gate as GET /:id.
		await requireScopeWorkspaces(c, frozenReportScope(report));
		// Editing changes the report's fields and re-renders, appending a new
		// immutable content version. The header stays the current, queryable state.
		const input = validate(updateReportInputSchema, await c.req.json());
		const note = normalizeNote(input.note ?? null);
		const version = report.version + 1;
		const {
			content,
			resolvedFilters,
			totalMinutes,
			projectIds,
			snapshotWorkspaceIds,
		} = await renderReportDocument(c, {
			name: input.name,
			templateId: input.templateId,
			filters: input.filters,
			note,
			version,
		});
		const updated = await updateReportWithNewVersion(c.var.db, report.id, {
			name: input.name,
			templateId: input.templateId,
			filters: resolvedFilters,
			note,
			totalMinutes,
			snapshotProjectIds: projectIds,
			snapshotWorkspaceIds,
			version,
			content,
		});
		if (!updated) throw new AppError("not_found", "Report not found");
		return c.json(toApiReport(updated.report, updated.content.content));
	})
	.delete("/:id", async (c) => {
		requireScope(c, "write");
		const report = await requireReportOwner(c, c.req.param("id"));
		// Shares and deliveries reference the report's content versions, which
		// cascade away with the report row — and take them along.
		await deleteReport(c.var.db, report.id);
		return c.body(null, 204);
	})
	// Minting a public link disseminates the rendered document, so the owner must
	// still cover its rendered scope (not the stored filter, which is empty for
	// instance scope).
	.post("/:id/shares", async (c) => {
		const { user } = requireScope(c, "write");
		const report = await requireReportOwner(c, c.req.param("id"));
		await requireScopeWorkspaces(c, frozenReportScope(report));
		const input = validate(
			createReportShareInputSchema,
			await parseOptionalJsonBody(c),
		);
		// Share the current content version by reference: versions are immutable
		// and never individually deleted, so a later edit (new version) never
		// changes a published page.
		const current = await getCurrentReportContent(c.var.db, report.id);
		if (!current) throw new AppError("internal", "Report content missing");
		const share = await createReportShare(c.var.db, {
			reportContentId: current.id,
			createdByUserId: user.id,
			token: generateShareToken(),
			...(await shareAttributesFromInput(input)),
		});
		return c.json(toApiShare(share), 201);
	})
	// Listed shares include plaintext tokens (content capabilities); reading them
	// follows the report's read access. The owner path re-checks the frozen
	// dissemination scope (the tokens are capabilities over workspace data); admin
	// readers are already authorized. Only owner-minted links are listed —
	// links minted by delivery recipients belong to their inbox view.
	.get("/:id/shares", async (c) => {
		const { user } = requireScope(c, "read");
		const report = await requireReportReadAccess(c, c.req.param("id"));
		if (report.ownerUserId === user.id) {
			await requireScopeWorkspaces(c, frozenReportScope(report));
		}
		const shares = await listReportSharesByReport(
			c.var.db,
			report.id,
			report.ownerUserId,
		);
		return c.json(shares.map(toApiShare));
	})
	// Recipient picker for "Send to": the union of members across the report's
	// rendered workspaces (people already entitled to its data), minus the sender.
	.get("/:id/recipients", async (c) => {
		const { user } = requireScope(c, "read");
		const report = await requireReportOwner(c, c.req.param("id"));
		await requireScopeWorkspaces(c, frozenReportScope(report));
		const members = await reportRecipientCandidates(c, report, user.id);
		return c.json(
			members.map(({ image, ...m }) => ({
				...m,
				imageUrl: resolveAvatarUrl(m.id, image),
			})),
		);
	})
	// Drops a frozen snapshot of the report into each recipient's inbox. The owner
	// must still cover the frozen dissemination scope; recipients are validated
	// against the workspace-members union so a send can't widen who sees the data.
	.post("/:id/send", async (c) => {
		const { user } = requireScope(c, "write");
		const report = await requireReportOwner(c, c.req.param("id"));
		await requireScopeWorkspaces(c, frozenReportScope(report));
		const input = validate(
			sendReportInputSchema,
			await parseOptionalJsonBody(c),
		);
		const candidates = await reportRecipientCandidates(c, report, user.id);
		const allowed = new Set(candidates.map((m) => m.id));
		const recipientIds = [...new Set(input.recipientUserIds)];
		for (const id of recipientIds) {
			if (!allowed.has(id)) {
				throw new AppError(
					"bad_request",
					"Recipient must be able to read every project in the report",
				);
			}
		}
		const message =
			input.message && input.message.trim() !== "" ? input.message : null;
		// Send the current content version by reference: versions are immutable,
		// so the recipient keeps what was sent even after a later edit (which
		// appends a new version).
		const current = await getCurrentReportContent(c.var.db, report.id);
		if (!current) throw new AppError("internal", "Report content missing");
		// One id shared by every row of this send so the sender's Sent folder can
		// group the fan-out back into a single entry.
		const batchId = crypto.randomUUID();
		const base = {
			batchId,
			reportContentId: current.id,
			senderUserId: user.id,
			senderName: user.name,
			senderEmail: user.email,
			message,
		};
		const deliveries = recipientIds.map((recipientUserId) => ({
			...base,
			recipientUserId,
		}));
		// A copy to the sender's own inbox: a self-row (recipient === sender) in the
		// same batch. It surfaces in the sender's Inbox but is excluded from the Sent
		// scope, so it never appears in the batch's recipient list (see the
		// report-deliveries queries).
		if (input.sendToSelf) {
			deliveries.push({ ...base, recipientUserId: user.id });
		}
		await createReportDeliveries(c.var.db, deliveries);
		// Notify the recipients (their inbox) and the sender (their Sent folder in
		// other open tabs, plus their own inbox when they sent a self-copy) — both
		// are backed by report_deliveries.
		publishToUsers(c, [...new Set([...recipientIds, user.id])], {
			type: "message",
		});
		// Count only the teammate recipients; the self-copy is an inbox convenience,
		// not a "sent to N people" delivery.
		return c.json({ delivered: recipientIds.length }, 201);
	})
	// A report's send history: one entry per "Send to" batch. Follows the same
	// read access as GET /:id/shares (owner, instance admin, or single-workspace
	// admin), so admin-read contexts see it too. Only the owner can send, so the
	// sender is always report.ownerUserId — never the (possibly admin) caller.
	.get("/:id/sends", async (c) => {
		const { user } = requireScope(c, "read");
		const report = await requireReportReadAccess(c, c.req.param("id"));
		const isOwner = report.ownerUserId === user.id;
		if (isOwner) {
			await requireScopeWorkspaces(c, report.filters.workspaceIds);
		}
		const sends = await listReportSendsByReport(
			c.var.db,
			report.id,
			report.ownerUserId,
		);
		return c.json(
			sends.map((s) => ({
				id: s.id,
				createdAt: s.createdAt.toISOString(),
				message: s.message,
				recipientNames: s.recipientNames,
				recipientCount: s.recipientCount,
				// Read state is the recipient's, not the (possibly admin) reader's.
				// Redact it for anyone but the owner, mirroring the admin delivery
				// read paths that null readAt — otherwise a single-recipient send
				// would leak whether that person opened it.
				readCount: isOwner ? s.readCount : 0,
			})),
		);
	});
