import {
	createWorkSpanInputSchema,
	listWorkSpansQuerySchema,
	todayInTimezone,
	updateWorkSpanInputSchema,
	type WorkSpanSource,
	workSpanStatsQuerySchema,
	workSpanTagsQuerySchema,
} from "@spantail/core";
import {
	createWorkSpan,
	deleteWorkSpan,
	getProjectById,
	getWorkSpanById,
	getWorkSpanStats,
	listWorkSpans,
	listWorkSpanTags,
	updateWorkSpan,
	type WorkSpanRow,
} from "@spantail/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireAuth, requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

async function requireProjectInWorkspace(
	c: Context<AppEnv>,
	projectId: string,
	workspaceId: string,
): Promise<void> {
	const project = await getProjectById(c.var.db, projectId);
	if (!project || project.workspaceId !== workspaceId) {
		throw new AppError(
			"bad_request",
			"Project does not belong to this workspace",
		);
	}
}

async function requireSpanAccess(
	c: Context<AppEnv>,
	id: string,
): Promise<WorkSpanRow> {
	const span = await getWorkSpanById(c.var.db, id);
	if (!span) throw new AppError("not_found", "Work span not found");
	await requireWorkspaceAccess(c, span.workspaceId);
	return span;
}

/**
 * Determines the client channel a create request came through. Session callers
 * are the web SPA; PAT callers tag themselves via X-Spantail-Client (cli/mcp) and
 * default to "api" (e.g. direct curl). This is informational metadata, so an
 * unrecognized header value is ignored rather than rejected.
 */
function resolveSource(c: Context<AppEnv>): WorkSpanSource {
	if (c.var.auth?.via === "session") return "web";
	const hint = c.req.header("x-spantail-client");
	if (hint === "cli" || hint === "mcp") return hint;
	return "api";
}

function requireAuthor(c: Context<AppEnv>, span: WorkSpanRow): void {
	const { user } = requireAuth(c);
	if (span.userId !== user.id) {
		throw new AppError("forbidden", "Only the author can modify a work span");
	}
}

export const workSpanRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireScope(c, "read");
		const query = validate(listWorkSpansQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		return c.json(await listWorkSpans(c.var.db, query));
	})
	.post("/", async (c) => {
		const { user } = requireScope(c, "write");
		const input = validate(createWorkSpanInputSchema, await c.req.json());
		const { workspace } = await requireWorkspaceAccess(c, input.workspaceId);
		await requireProjectInWorkspace(c, input.projectId, input.workspaceId);

		const span = await createWorkSpan(c.var.db, {
			workspaceId: input.workspaceId,
			projectId: input.projectId,
			userId: user.id,
			spanDate: input.spanDate ?? todayInTimezone(workspace.timezone),
			durationMinutes: input.durationMinutes,
			startedAt: input.startedAt ? new Date(input.startedAt) : null,
			endedAt: input.endedAt ? new Date(input.endedAt) : null,
			description: input.description,
			note: input.note ?? null,
			tags: input.tags,
			source: resolveSource(c),
		});
		return c.json(span, 201);
	})
	// Registered before "/:id" so "stats" is not captured as an span id.
	.get("/stats", async (c) => {
		requireScope(c, "read");
		const query = validate(workSpanStatsQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		return c.json(await getWorkSpanStats(c.var.db, query));
	})
	// Likewise registered before "/:id" so "tags" is not captured as an span id.
	.get("/tags", async (c) => {
		requireScope(c, "read");
		const query = validate(workSpanTagsQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		return c.json(await listWorkSpanTags(c.var.db, query));
	})
	.get("/:id", async (c) => {
		requireScope(c, "read");
		const span = await requireSpanAccess(c, c.req.param("id"));
		return c.json(span);
	})
	.patch("/:id", async (c) => {
		requireScope(c, "write");
		const span = await requireSpanAccess(c, c.req.param("id"));
		requireAuthor(c, span);
		const input = validate(updateWorkSpanInputSchema, await c.req.json());
		// A null projectId is only allowed to preserve an already-orphaned span
		// (its project was deleted); live spans cannot be unassigned.
		if (input.projectId === null && span.projectId !== null) {
			throw new AppError(
				"bad_request",
				"Cannot unassign an span from its project",
			);
		}
		if (input.projectId) {
			await requireProjectInWorkspace(c, input.projectId, span.workspaceId);
		}
		const { startedAt, endedAt, ...rest } = input;
		const updated = await updateWorkSpan(c.var.db, span.id, {
			...rest,
			...(startedAt === undefined
				? {}
				: { startedAt: startedAt ? new Date(startedAt) : null }),
			...(endedAt === undefined
				? {}
				: { endedAt: endedAt ? new Date(endedAt) : null }),
		});
		return c.json(updated);
	})
	.delete("/:id", async (c) => {
		requireScope(c, "write");
		const span = await requireSpanAccess(c, c.req.param("id"));
		requireAuthor(c, span);
		await deleteWorkSpan(c.var.db, span.id);
		return c.body(null, 204);
	});
