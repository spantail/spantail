import {
	createWorkEntriesBatchInputSchema,
	createWorkEntryInputSchema,
	listWorkEntriesQuerySchema,
	resolveUserTimezone,
	todayInTimezone,
	updateWorkEntryInputSchema,
	type WorkEntrySource,
	workEntryStatsQuerySchema,
	workEntryTagsQuerySchema,
} from "@spantail/core";
import {
	createWorkEntriesBatch,
	createWorkEntry,
	deleteWorkEntry,
	getProjectById,
	getWorkEntryById,
	getWorkEntryOwnersByIds,
	getWorkEntryStats,
	isProjectMember,
	listWorkEntries,
	listWorkEntryTags,
	updateWorkEntry,
	WorkEntryOwnershipConflictError,
	type WorkEntryRow,
} from "@spantail/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import {
	requireProjectAccess,
	requireWorkspaceAccess,
	resolveEntryAccess,
} from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireAuth, requireScope } from "../middleware/auth";
import { ingestRateLimit } from "../middleware/rate-limit";
import { publishToWorkspace } from "../realtime/publish";
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
	const { user } = requireAuth(c);
	const entry = await getWorkEntryById(c.var.db, id);
	if (!entry) throw new AppError("not_found", "Work entry not found");
	const { membership } = await requireWorkspaceAccess(c, entry.workspaceId);
	// Project ACL: an entry assigned to a project is readable only by workspace
	// admins, the entry's author, or a member of that project. Others get 404 so
	// the entry's existence is not revealed.
	const isAdmin = membership.role === "owner" || membership.role === "admin";
	if (
		entry.projectId !== null &&
		!isAdmin &&
		entry.userId !== user.id &&
		!(await isProjectMember(c.var.db, entry.projectId, user.id))
	) {
		throw new AppError("not_found", "Work entry not found");
	}
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
		const { user } = requireScope(c, "read");
		const query = validate(listWorkEntriesQuerySchema, c.req.query());
		const { membership } = await requireWorkspaceAccess(c, query.workspaceId);
		const access = resolveEntryAccess(query.workspaceId, membership, user.id);
		return c.json(await listWorkEntries(c.var.db, { ...query, access }));
	})
	// Rate-limited per credential (token, or user for sessions): a write
	// credential must not flood the store.
	.post("/", ingestRateLimit, async (c) => {
		const { user } = requireScope(c, "write");
		const input = validate(createWorkEntryInputSchema, await c.req.json());
		const { membership } = await requireWorkspaceAccess(c, input.workspaceId);
		await requireProjectInWorkspace(c, input.projectId, input.workspaceId);
		await requireProjectAccess(c, input.projectId, membership, user.id);

		const entry = await createWorkEntry(c.var.db, {
			workspaceId: input.workspaceId,
			projectId: input.projectId,
			userId: user.id,
			entryDate:
				input.entryDate ?? todayInTimezone(resolveUserTimezone(user.timezone)),
			durationMinutes: input.durationMinutes,
			startedAt: input.startedAt ? new Date(input.startedAt) : null,
			endedAt: input.endedAt ? new Date(input.endedAt) : null,
			description: input.description,
			note: input.note ?? null,
			tags: input.tags,
			source: resolveSource(c),
		});
		publishToWorkspace(c, {
			type: "work-entry",
			workspaceId: input.workspaceId,
		});
		return c.json(entry, 201);
	})
	// Bulk import for data migration: one workspace per request, all entries
	// inserted atomically (one D1 batch), entryDate always explicit. An entry
	// with an externalId uses it as its primary key, so re-sending the same
	// batch upserts instead of duplicating.
	.post("/batch", ingestRateLimit, async (c) => {
		const { user } = requireScope(c, "write");
		const input = validate(
			createWorkEntriesBatchInputSchema,
			await c.req.json(),
		);
		const { membership } = await requireWorkspaceAccess(c, input.workspaceId);

		// One statement must not touch the same row twice (SQLite errors), so
		// duplicate externalIds within a request are rejected up front.
		const externalIds = input.entries
			.map((e) => e.externalId)
			.filter((id): id is string => id !== undefined);
		if (new Set(externalIds).size !== externalIds.length) {
			throw new AppError(
				"bad_request",
				"Duplicate externalId values in one batch",
			);
		}

		// Permission checks once per distinct project, not per row. Capped so a
		// batch cannot exhaust the D1 per-invocation query budget.
		const projectIds = [...new Set(input.entries.map((e) => e.projectId))];
		if (projectIds.length > 50) {
			throw new AppError(
				"bad_request",
				"Too many distinct projects in one batch (max 50)",
			);
		}
		for (const projectId of projectIds) {
			await requireProjectInWorkspace(c, projectId, input.workspaceId);
			await requireProjectAccess(c, projectId, membership, user.id);
		}

		// Client-supplied primary keys: reject any externalId that already exists
		// as another user's or another workspace's entry (409, nothing written).
		if (externalIds.length > 0) {
			const owners = await getWorkEntryOwnersByIds(c.var.db, externalIds);
			const foreign = owners.find(
				(o) => o.workspaceId !== input.workspaceId || o.userId !== user.id,
			);
			if (foreign) {
				throw new AppError(
					"conflict",
					`externalId "${foreign.id}" already exists and belongs to another user or workspace`,
				);
			}
		}

		const source = resolveSource(c);
		const rows = input.entries.map((e) => ({
			id: e.externalId ?? crypto.randomUUID(),
			workspaceId: input.workspaceId,
			projectId: e.projectId,
			userId: user.id,
			entryDate: e.entryDate,
			durationMinutes: e.durationMinutes,
			startedAt: e.startedAt ? new Date(e.startedAt) : null,
			endedAt: e.endedAt ? new Date(e.endedAt) : null,
			description: e.description,
			note: e.note ?? null,
			tags: e.tags,
			source,
		}));
		try {
			await createWorkEntriesBatch(c.var.db, rows);
		} catch (error) {
			// A conflict that raced past the pre-check above: the batch rolled
			// back, so the promised all-or-nothing semantics still hold.
			if (error instanceof WorkEntryOwnershipConflictError) {
				throw new AppError("conflict", error.message);
			}
			throw error;
		}
		publishToWorkspace(c, {
			type: "work-entry",
			workspaceId: input.workspaceId,
		});
		return c.json({ count: rows.length }, 201);
	})
	// Registered before "/:id" so "stats" is not captured as an entry id.
	.get("/stats", async (c) => {
		const { user } = requireScope(c, "read");
		const query = validate(workEntryStatsQuerySchema, c.req.query());
		const { membership } = await requireWorkspaceAccess(c, query.workspaceId);
		const access = resolveEntryAccess(query.workspaceId, membership, user.id);
		return c.json(await getWorkEntryStats(c.var.db, { ...query, access }));
	})
	// Likewise registered before "/:id" so "tags" is not captured as an entry id.
	.get("/tags", async (c) => {
		const { user } = requireScope(c, "read");
		const query = validate(workEntryTagsQuerySchema, c.req.query());
		const { membership } = await requireWorkspaceAccess(c, query.workspaceId);
		const access = resolveEntryAccess(query.workspaceId, membership, user.id);
		return c.json(await listWorkEntryTags(c.var.db, { ...query, access }));
	})
	.get("/:id", async (c) => {
		requireScope(c, "read");
		const entry = await requireEntryAccess(c, c.req.param("id"));
		return c.json(entry);
	})
	.patch("/:id", async (c) => {
		const { user } = requireScope(c, "write");
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
		// Project membership is only required when assigning to a *different* live
		// project. Editing other fields of an own entry whose project is unchanged
		// stays allowed even if the author has since left that project.
		if (input.projectId && input.projectId !== entry.projectId) {
			await requireProjectInWorkspace(c, input.projectId, entry.workspaceId);
			const { membership } = await requireWorkspaceAccess(c, entry.workspaceId);
			await requireProjectAccess(c, input.projectId, membership, user.id);
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
		publishToWorkspace(c, {
			type: "work-entry",
			workspaceId: entry.workspaceId,
		});
		return c.json(updated);
	})
	.delete("/:id", async (c) => {
		requireScope(c, "write");
		const entry = await requireEntryAccess(c, c.req.param("id"));
		requireAuthor(c, entry);
		await deleteWorkEntry(c.var.db, entry.id);
		publishToWorkspace(c, {
			type: "work-entry",
			workspaceId: entry.workspaceId,
		});
		return c.body(null, 204);
	});
