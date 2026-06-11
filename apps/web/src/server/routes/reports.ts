import {
	createReportInputSchema,
	filterEntriesByTags,
	getBuiltinTemplate,
	isBuiltinTemplateId,
	type ReportScope,
	renderReport,
	resolveDateRange,
	updateReportInputSchema,
} from "@toxil/core";
import {
	createReport,
	createReportSnapshot,
	deleteReport,
	getReportById,
	getReportTemplateById,
	listProjectsByIds,
	listReportSnapshots,
	listReportsByOwner,
	listUsersByIds,
	listWorkEntriesForReport,
	listWorkspacesForUser,
	type ReportRow,
	updateReport,
} from "@toxil/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import { requireAuth, requireScope } from "../middleware/auth";
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

type MemberWorkspace = Awaited<
	ReturnType<typeof listWorkspacesForUser>
>[number];

/**
 * Cross-workspace scopes are limited to the union of the caller's
 * memberships; the template must be builtin or reachable the same way.
 */
async function validateScopeAndTemplate(
	c: Context<AppEnv>,
	userId: string,
	scope: ReportScope,
	templateId: string,
): Promise<{ workspaces: MemberWorkspace[]; templateBody: string }> {
	const workspaces = await listWorkspacesForUser(c.var.db, userId);
	const memberIds = new Set(workspaces.map((w) => w.id));
	for (const workspaceId of scope.workspaceIds) {
		if (!memberIds.has(workspaceId)) {
			throw new AppError(
				"forbidden",
				"Report scope includes a workspace outside your memberships",
			);
		}
	}

	if (isBuiltinTemplateId(templateId)) {
		const builtin = getBuiltinTemplate(templateId);
		if (!builtin) throw new AppError("not_found", "Report template not found");
		return { workspaces, templateBody: builtin.body };
	}
	const template = await getReportTemplateById(c.var.db, templateId);
	if (!template || !memberIds.has(template.workspaceId)) {
		throw new AppError("not_found", "Report template not found");
	}
	return { workspaces, templateBody: template.body };
}

/** Blank notes collapse to null so templates can truth-test them. */
function normalizeNote(note: string | null): string | null {
	return note && note.trim() !== "" ? note : null;
}

export const reportRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		const { user } = requireScope(c, "read");
		return c.json(await listReportsByOwner(c.var.db, user.id));
	})
	.post("/", async (c) => {
		const { user } = requireScope(c, "write");
		const input = validate(createReportInputSchema, await c.req.json());
		await validateScopeAndTemplate(c, user.id, input.scope, input.templateId);
		const report = await createReport(c.var.db, {
			name: input.name,
			ownerUserId: user.id,
			templateId: input.templateId,
			scope: input.scope,
			note: normalizeNote(input.note ?? null),
		});
		return c.json(report, 201);
	})
	.get("/:id", async (c) => {
		requireScope(c, "read");
		return c.json(await requireReportOwner(c, c.req.param("id")));
	})
	.patch("/:id", async (c) => {
		const { user } = requireScope(c, "write");
		const report = await requireReportOwner(c, c.req.param("id"));
		const input = validate(updateReportInputSchema, await c.req.json());
		if (input.scope !== undefined || input.templateId !== undefined) {
			await validateScopeAndTemplate(
				c,
				user.id,
				input.scope ?? report.scope,
				input.templateId ?? report.templateId,
			);
		}
		const updated = await updateReport(c.var.db, report.id, {
			...input,
			...(input.note === undefined ? {} : { note: normalizeNote(input.note) }),
		});
		return c.json(updated);
	})
	.delete("/:id", async (c) => {
		requireScope(c, "write");
		const report = await requireReportOwner(c, c.req.param("id"));
		await deleteReport(c.var.db, report.id);
		return c.body(null, 204);
	})
	.post("/:id/run", async (c) => {
		const { user } = requireScope(c, "write");
		const report = await requireReportOwner(c, c.req.param("id"));
		const scope = report.scope;
		const { workspaces, templateBody } = await validateScopeAndTemplate(
			c,
			user.id,
			scope,
			report.templateId,
		);

		const scoped = workspaces.filter((w) => scope.workspaceIds.includes(w.id));
		const anchor = scoped.find((w) => w.id === scope.workspaceIds[0]);
		if (!anchor) throw new AppError("internal", "Scope workspace missing");
		const range = resolveDateRange(scope.dateRange, anchor.timezone);

		const rows = await listWorkEntriesForReport(c.var.db, {
			workspaceIds: scope.workspaceIds,
			projectIds: scope.projectIds,
			userIds: scope.userIds,
			from: range.from,
			to: range.to,
		});
		const entries = filterEntriesByTags(rows, scope.tags);
		const [projects, users] = await Promise.all([
			listProjectsByIds(c.var.db, [
				...new Set(entries.map((e) => e.projectId)),
			]),
			listUsersByIds(c.var.db, [...new Set(entries.map((e) => e.userId))]),
		]);

		let renderedMarkdown: string;
		try {
			renderedMarkdown = await renderReport(templateBody, {
				report: { name: report.name, note: report.note },
				period: {
					...range,
					preset: typeof scope.dateRange === "string" ? scope.dateRange : null,
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
			throw new AppError(
				"bad_request",
				`Template rendering failed: ${message}`,
			);
		}

		const snapshot = await createReportSnapshot(c.var.db, {
			reportId: report.id,
			renderedMarkdown,
			resolvedScope: { ...scope, dateRange: range },
		});
		return c.json(snapshot, 201);
	})
	.get("/:id/snapshots", async (c) => {
		requireScope(c, "read");
		const report = await requireReportOwner(c, c.req.param("id"));
		return c.json(await listReportSnapshots(c.var.db, report.id));
	});
