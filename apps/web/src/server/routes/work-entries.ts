import {
	createWorkEntryInputSchema,
	listWorkEntriesQuerySchema,
	todayInTimezone,
	updateWorkEntryInputSchema,
	type WorkEntrySource,
	workEntryStatsQuerySchema,
	workEntryTagsQuerySchema,
} from "@spantail/core";
import {
	createWorkEntry,
	deleteWorkEntry,
	getProjectById,
	getWorkEntryById,
	getWorkEntryStats,
	listWorkEntries,
	listWorkEntryTags,
	updateWorkEntry,
	type WorkEntryRow,
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

async function requireEntryAccess(
	c: Context<AppEnv>,
	id: string,
): Promise<WorkEntryRow> {
	const entry = await getWorkEntryById(c.var.db, id);
	if (!entry) throw new AppError("not_found", "Work entry not found");
	await requireWorkspaceAccess(c, entry.workspaceId);
	return entry;
}

/**
 * Determines the client channel a create request came through. Session callers
 * are the web SPA; PAT callers tag themselves via X-Spantail-Client (cli/mcp) and
 * default to "api" (e.g. direct curl). This is informational metadata, so an
 * unrecognized header value is ignored rather than rejected.
 */
function resolveSource(c: Context<AppEnv>): WorkEntrySource {
	if (c.var.auth?.via === "session") return "web";
	const hint = c.req.header("x-spantail-client");
	if (hint === "cli" || hint === "mcp") return hint;
	return "api";
}

function requireAuthor(c: Context<AppEnv>, entry: WorkEntryRow): void {
	const { user } = requireAuth(c);
	if (entry.userId !== user.id) {
		throw new AppError("forbidden", "Only the author can modify a work entry");
	}
}

export const workEntryRoutes = new Hono<AppEnv>()
	.get("/", async (c) => {
		requireScope(c, "read");
		const query = validate(listWorkEntriesQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		return c.json(await listWorkEntries(c.var.db, query));
	})
	.post("/", async (c) => {
		const { user } = requireScope(c, "write");
		const input = validate(createWorkEntryInputSchema, await c.req.json());
		const { workspace } = await requireWorkspaceAccess(c, input.workspaceId);
		await requireProjectInWorkspace(c, input.projectId, input.workspaceId);

		const entry = await createWorkEntry(c.var.db, {
			workspaceId: input.workspaceId,
			projectId: input.projectId,
			userId: user.id,
			entryDate: input.entryDate ?? todayInTimezone(workspace.timezone),
			durationMinutes: input.durationMinutes,
			startedAt: input.startedAt ? new Date(input.startedAt) : null,
			endedAt: input.endedAt ? new Date(input.endedAt) : null,
			description: input.description,
			note: input.note ?? null,
			tags: input.tags,
			source: resolveSource(c),
		});
		return c.json(entry, 201);
	})
	// Registered before "/:id" so "stats" is not captured as an entry id.
	.get("/stats", async (c) => {
		requireScope(c, "read");
		const query = validate(workEntryStatsQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		return c.json(await getWorkEntryStats(c.var.db, query));
	})
	// Likewise registered before "/:id" so "tags" is not captured as an entry id.
	.get("/tags", async (c) => {
		requireScope(c, "read");
		const query = validate(workEntryTagsQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		return c.json(await listWorkEntryTags(c.var.db, query));
	})
	.get("/:id", async (c) => {
		requireScope(c, "read");
		const entry = await requireEntryAccess(c, c.req.param("id"));
		return c.json(entry);
	})
	.patch("/:id", async (c) => {
		requireScope(c, "write");
		const entry = await requireEntryAccess(c, c.req.param("id"));
		requireAuthor(c, entry);
		const input = validate(updateWorkEntryInputSchema, await c.req.json());
		// A null projectId is only allowed to preserve an already-orphaned entry
		// (its project was deleted); live entries cannot be unassigned.
		if (input.projectId === null && entry.projectId !== null) {
			throw new AppError(
				"bad_request",
				"Cannot unassign an entry from its project",
			);
		}
		if (input.projectId) {
			await requireProjectInWorkspace(c, input.projectId, entry.workspaceId);
		}
		const { startedAt, endedAt, ...rest } = input;
		const updated = await updateWorkEntry(c.var.db, entry.id, {
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
		const entry = await requireEntryAccess(c, c.req.param("id"));
		requireAuthor(c, entry);
		await deleteWorkEntry(c.var.db, entry.id);
		return c.body(null, 204);
	});
