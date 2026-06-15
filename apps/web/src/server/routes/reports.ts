import {
	type AbsoluteDateRange,
	createReportInputSchema,
	createReportShareInputSchema,
	filterEntriesByTags,
	generateShareToken,
	getBuiltinTemplate,
	hashSharePasscode,
	isBuiltinTemplateId,
	type ReportFilters,
	type ReportFiltersInput,
	renderReport,
	resolveBuiltinTemplateSettings,
	resolveDateRange,
	updateReportInputSchema,
} from "@toxil/core";
import {
	createReport,
	createReportShare,
	deleteReport,
	getReportById,
	getReportTemplateById,
	listProjectsByIds,
	listReportMetaByOwner,
	listReportSharesByReport,
	listUsersByIds,
	listWorkEntriesForReport,
	listWorkspacesForUser,
	type ReportRow,
	updateReport,
} from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import {
	type MemberWorkspace,
	requireScopeWorkspaces,
} from "../lib/permissions";
import { toApiShare } from "../lib/share-api";
import { validate } from "../lib/validate";
import { requireAuth, requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * Cross-workspace filters are limited to the union of the caller's
 * memberships, and a custom template must belong to a filtered workspace (its
 * body is baked into the rendered document). Returns the caller's memberships,
 * the template body to render with, and whether the template is enabled in the
 * report's anchor workspace (builtins read the workspace settings override).
 */
async function validateFiltersAndTemplate(
	c: Context<AppEnv>,
	workspaceIds: string[],
	templateId: string,
): Promise<{
	workspaces: MemberWorkspace[];
	templateBody: string;
	enabled: boolean;
}> {
	const workspaces = await requireScopeWorkspaces(c, workspaceIds);
	const memberIds = new Set(workspaces.map((w) => w.id));

	if (isBuiltinTemplateId(templateId)) {
		const builtin = getBuiltinTemplate(templateId);
		if (!builtin) throw new AppError("not_found", "Report template not found");
		const anchor = workspaces.find((w) => w.id === workspaceIds[0]);
		const enabled = anchor
			? resolveBuiltinTemplateSettings(anchor.settings, templateId).enabled
			: builtin.enabled;
		return { workspaces, templateBody: builtin.body, enabled };
	}
	const template = await getReportTemplateById(c.var.db, templateId);
	if (!template || !memberIds.has(template.workspaceId)) {
		throw new AppError("not_found", "Report template not found");
	}
	if (!workspaceIds.includes(template.workspaceId)) {
		throw new AppError(
			"bad_request",
			"Template must belong to a workspace in the report filters",
		);
	}
	return { workspaces, templateBody: template.body, enabled: template.enabled };
}

/** Blank notes collapse to null so templates can truth-test them. */
function normalizeNote(note: string | null): string | null {
	return note && note.trim() !== "" ? note : null;
}

/**
 * Validates membership + template, resolves the period to absolute dates, and
 * renders the document synchronously. A template error surfaces as a 400 so a
 * create/edit never persists an un-renderable report.
 */
async function renderReportDocument(
	c: Context<AppEnv>,
	doc: {
		name: string;
		templateId: string;
		filters: ReportFiltersInput;
		note: string | null;
	},
): Promise<{
	renderedMarkdown: string;
	resolvedFilters: ReportFilters;
	totalMinutes: number;
}> {
	const { filters, templateId } = doc;
	const { workspaces, templateBody, enabled } =
		await validateFiltersAndTemplate(c, filters.workspaceIds, templateId);
	// A disabled (archived) template can't back a new or edited report; existing
	// reports stay viewable/shareable, only re-rendering is blocked.
	if (!enabled) {
		throw new AppError("bad_request", "Report template is disabled");
	}

	const scoped = workspaces.filter((w) => filters.workspaceIds.includes(w.id));
	const anchor = scoped.find((w) => w.id === filters.workspaceIds[0]);
	if (!anchor) throw new AppError("internal", "Filter workspace missing");
	const range: AbsoluteDateRange = resolveDateRange(
		filters.dateRange,
		anchor.timezone,
	);

	const rows = await listWorkEntriesForReport(c.var.db, {
		workspaceIds: filters.workspaceIds,
		projectIds: filters.projectIds,
		userIds: filters.userIds,
		from: range.from,
		to: range.to,
	});
	const entries = filterEntriesByTags(rows, filters.tags);
	const [projects, users] = await Promise.all([
		listProjectsByIds(c.var.db, [...new Set(entries.map((e) => e.projectId))]),
		listUsersByIds(c.var.db, [...new Set(entries.map((e) => e.userId))]),
	]);

	let renderedMarkdown: string;
	try {
		renderedMarkdown = await renderReport(templateBody, {
			report: { name: doc.name, note: doc.note },
			period: {
				...range,
				// The stored period is absolute; preset names are a wire convenience.
				preset:
					typeof filters.dateRange === "string" ? filters.dateRange : null,
			},
			timezone: anchor.timezone,
			generatedAt: new Date(),
			workspaces: scoped.map((w) => ({
				id: w.id,
				slug: w.slug,
				name: w.name,
				timezone: w.timezone,
			})),
			projects,
			users: users.map((u) => ({ id: u.id, name: u.name })),
			entries,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new AppError("bad_request", `Template rendering failed: ${message}`);
	}

	const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

	return {
		renderedMarkdown,
		resolvedFilters: { ...filters, dateRange: range },
		totalMinutes,
	};
}

async function parseOptionalJsonBody(c: Context<AppEnv>): Promise<unknown> {
	const rawBody = await c.req.text();
	if (rawBody.trim() === "") return {};
	try {
		return JSON.parse(rawBody);
	} catch {
		throw new AppError("bad_request", "Request body must be valid JSON");
	}
}

export const reportRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const { user } = requireScope(c, "read");
		// Metadata only: the rendered body is fetched on demand via GET /:id.
		const metas = await listReportMetaByOwner(c.var.db, user.id);
		// totalMinutes is an aggregate of workspace entries (report content), so it
		// is redacted for reports whose scope the owner no longer fully covers —
		// mirroring the membership re-check that gates the full report read.
		const memberIds = new Set(
			(await listWorkspacesForUser(c.var.db, user.id)).map((w) => w.id),
		);
		return c.json(
			metas.map((report) =>
				report.filters.workspaceIds.every((id) => memberIds.has(id))
					? report
					: { ...report, totalMinutes: null },
			),
		);
	})
	.post("/", async (c) => {
		const { user } = requireScope(c, "write");
		const input = validate(createReportInputSchema, await c.req.json());
		const note = normalizeNote(input.note ?? null);
		const { renderedMarkdown, resolvedFilters, totalMinutes } =
			await renderReportDocument(c, {
				name: input.name,
				templateId: input.templateId,
				filters: input.filters,
				note,
			});
		const report = await createReport(c.var.db, {
			name: input.name,
			ownerUserId: user.id,
			templateId: input.templateId,
			filters: resolvedFilters,
			note,
			totalMinutes,
			renderedMarkdown,
		});
		return c.json(report, 201);
	})
	.get("/:id", async (c) => {
		requireScope(c, "read");
		const report = await requireReportOwner(c, c.req.param("id"));
		// The rendered markdown is workspace data: losing membership in any
		// filtered workspace also revokes access to the report's content.
		await requireScopeWorkspaces(c, report.filters.workspaceIds);
		return c.json(report);
	})
	.patch("/:id", async (c) => {
		requireScope(c, "write");
		const report = await requireReportOwner(c, c.req.param("id"));
		const input = validate(updateReportInputSchema, await c.req.json());
		// Every edit re-renders against the merged definition, so a stale field
		// is never persisted and membership is re-checked on every render.
		const name = input.name ?? report.name;
		const templateId = input.templateId ?? report.templateId;
		const filters = input.filters ?? report.filters;
		const note =
			input.note === undefined ? report.note : normalizeNote(input.note);
		const { renderedMarkdown, resolvedFilters, totalMinutes } =
			await renderReportDocument(c, {
				name,
				templateId,
				filters,
				note,
			});
		const updated = await updateReport(c.var.db, report.id, {
			name,
			templateId,
			filters: resolvedFilters,
			note,
			totalMinutes,
			renderedMarkdown,
		});
		return c.json(updated);
	})
	.delete("/:id", async (c) => {
		requireScope(c, "write");
		const report = await requireReportOwner(c, c.req.param("id"));
		// Drop the frozen R2 copies before the rows cascade away with the report.
		const shares = await listReportSharesByReport(c.var.db, report.id);
		await Promise.all(
			shares.map((share) => c.env.SHARE_BUCKET.delete(share.r2Key)),
		);
		await deleteReport(c.var.db, report.id);
		return c.body(null, 204);
	})
	// Minting a public link is at least as sensitive as reading the report, so
	// it carries the same membership re-check as GET /:id.
	.post("/:id/shares", async (c) => {
		requireScope(c, "write");
		const report = await requireReportOwner(c, c.req.param("id"));
		await requireScopeWorkspaces(c, report.filters.workspaceIds);
		const input = validate(
			createReportShareInputSchema,
			await parseOptionalJsonBody(c),
		);
		const token = generateShareToken();
		const r2Key = `shares/${token}`;
		// Freeze the body to R2 before the row exists, so a failed insert leaves
		// only an unreachable object (no row points at it) rather than a row with
		// no content.
		await c.env.SHARE_BUCKET.put(r2Key, report.renderedMarkdown, {
			httpMetadata: {
				contentType: "text/plain; charset=utf-8",
				cacheControl: "public, immutable, max-age=31536000",
			},
		});
		try {
			const share = await createReportShare(c.var.db, {
				reportId: report.id,
				token,
				r2Key,
				// Title/period are frozen here too, so a later edit never changes a
				// published page.
				reportName: report.name,
				dateFrom: report.filters.dateRange.from,
				dateTo: report.filters.dateRange.to,
				passcodeHash: input.passcode
					? await hashSharePasscode(input.passcode)
					: null,
				expiresAt: input.expiresInDays
					? new Date(Date.now() + input.expiresInDays * DAY_MS)
					: null,
			});
			return c.json(toApiShare(share), 201);
		} catch (error) {
			await c.env.SHARE_BUCKET.delete(r2Key).catch(() => {});
			throw error;
		}
	})
	// Listed shares include plaintext tokens (content capabilities), so the list
	// needs the membership re-check too.
	.get("/:id/shares", async (c) => {
		requireScope(c, "read");
		const report = await requireReportOwner(c, c.req.param("id"));
		await requireScopeWorkspaces(c, report.filters.workspaceIds);
		const shares = await listReportSharesByReport(c.var.db, report.id);
		return c.json(shares.map(toApiShare));
	});
