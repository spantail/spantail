import {
	createWorkEntriesBatchInputSchema,
	createWorkEntryInputSchema,
	listWorkEntriesQuerySchema,
	MAX_LINKED_AGENT_ENTRIES,
	MAX_PROJECTS_PER_BATCH,
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
	getAgentEntriesByIds,
	getProjectById,
	getWorkEntryById,
	getWorkEntryOwnersByIds,
	getWorkEntryStats,
	isProjectMember,
	listAgentEntriesBySession,
	listAgentEntriesForWorkEntry,
	listMembers,
	listWorkEntries,
	listWorkEntryTags,
	type MembershipRow,
	updateWorkEntry,
	WorkEntryOwnershipConflictError,
	type WorkEntryRow,
} from "@spantail/db";
import type { Context } from "hono";
import { Hono } from "hono";

import { serializeAgentEntry } from "../lib/agent-entry";
import { AppError } from "../lib/errors";
import {
	isWorkspaceAdmin,
	requireProjectAccess,
	requireWorkspaceAccess,
	resolveEntryAccess,
} from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireAgentsFeature } from "../middleware/agents-feature";
import { requireAuth, requireScope } from "../middleware/auth";
import { ingestBodyLimit } from "../middleware/body-limit";
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
	opts: { write?: boolean } = {},
): Promise<{ entry: WorkEntryRow; membership: MembershipRow }> {
	const { user } = requireAuth(c);
	const entry = await getWorkEntryById(c.var.db, id);
	if (!entry) throw new AppError("not_found", "Work entry not found");
	const { membership } = await requireWorkspaceAccess(
		c,
		entry.workspaceId,
		"member",
		opts,
	);
	// Project ACL: an entry assigned to a project is readable only by workspace
	// admins, the entry's author, or a member of that project. Others get 404 so
	// the entry's existence is not revealed.
	if (
		entry.projectId !== null &&
		!isWorkspaceAdmin(membership.role) &&
		entry.userId !== user.id &&
		!(await isProjectMember(c.var.db, entry.projectId, user.id))
	) {
		throw new AppError("not_found", "Work entry not found");
	}
	return { entry, membership };
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
	// Size- and rate-limited per credential (token, or user for sessions): a
	// write credential must not flood the store.
	.post("/", ingestBodyLimit, ingestRateLimit, async (c) => {
		const { user } = requireScope(c, "write");
		const input = validate(createWorkEntryInputSchema, await c.req.json());
		const { membership } = await requireWorkspaceAccess(
			c,
			input.workspaceId,
			"member",
			{ write: true },
		);
		await requireProjectInWorkspace(c, input.projectId, input.workspaceId);
		await requireProjectAccess(c, input.projectId, membership, user.id);

		// Linked agent entries must be the caller's own, in the same workspace.
		// Reading a colleague's session (admins and project members can) is not
		// enough: a link asserts "my work came from this session", so linking
		// foreign sessions would misattribute their work. One uniform message —
		// missing and foreign ids are indistinguishable, so the endpoint cannot
		// be used to probe other users' session ids.
		const agentEntryIds = [...new Set(input.agentEntryIds ?? [])];
		if (agentEntryIds.length > 0) {
			const rows = await getAgentEntriesByIds(c.var.db, agentEntryIds);
			const byId = new Map(rows.map((row) => [row.id, row]));
			const linkable = agentEntryIds.every((id) => {
				const row = byId.get(id);
				return (
					row !== undefined &&
					row.workspaceId === input.workspaceId &&
					row.ownerUserId === user.id
				);
			});
			if (!linkable) {
				throw new AppError(
					"bad_request",
					"agentEntryIds contains an unknown or inaccessible agent entry",
				);
			}
		}
		// The caller's current session, by contrast, links best-effort: an id
		// with no matching entry (not ingested yet, or recorded under another
		// workspace) is not an error — the query's owner + workspace scope is
		// the same ACL the explicit-id path enforces above. Explicit ids come
		// first so the cap cannot evict what the caller asked for by name.
		if (input.sessionId) {
			const own = await listAgentEntriesBySession(c.var.db, {
				workspaceId: input.workspaceId,
				ownerUserId: user.id,
				sessionId: input.sessionId,
			});
			for (const row of own) {
				if (!agentEntryIds.includes(row.id)) agentEntryIds.push(row.id);
			}
			agentEntryIds.splice(MAX_LINKED_AGENT_ENTRIES);
		}

		const entry = await createWorkEntry(
			c.var.db,
			{
				workspaceId: input.workspaceId,
				projectId: input.projectId,
				userId: user.id,
				entryDate:
					input.entryDate ??
					todayInTimezone(resolveUserTimezone(user.timezone)),
				durationMinutes: input.durationMinutes,
				startedAt: input.startedAt ? new Date(input.startedAt) : null,
				endedAt: input.endedAt ? new Date(input.endedAt) : null,
				description: input.description,
				note: input.note ?? null,
				tags: input.tags,
				source: resolveSource(c),
			},
			agentEntryIds,
		);
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
	.post("/batch", ingestBodyLimit, ingestRateLimit, async (c) => {
		const { user } = requireScope(c, "write");
		const input = validate(
			createWorkEntriesBatchInputSchema,
			await c.req.json(),
		);
		const { membership } = await requireWorkspaceAccess(
			c,
			input.workspaceId,
			"member",
			{ write: true },
		);

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
		// batch cannot exhaust the D1 per-invocation query budget (50 on Workers
		// Free; each project costs two lookups).
		const projectIds = [...new Set(input.entries.map((e) => e.projectId))];
		if (projectIds.length > MAX_PROJECTS_PER_BATCH) {
			throw new AppError(
				"bad_request",
				`Too many distinct projects in one batch (max ${MAX_PROJECTS_PER_BATCH})`,
			);
		}
		for (const projectId of projectIds) {
			await requireProjectInWorkspace(c, projectId, input.workspaceId);
			await requireProjectAccess(c, projectId, membership, user.id);
		}

		// Author attribution. By default every row is authored by the caller. An
		// instance admin may instead name each entry's author by email (`user`) —
		// so one import can land a whole team's history at once — as long as the
		// email belongs to a member of the target workspace. Non-admins may only
		// author as themselves (a deliberate security control).
		const callerEmail = user.email.toLowerCase();
		const requestedEmails = [
			...new Set(
				input.entries
					.map((e) => e.user)
					.filter((email): email is string => email !== undefined),
			),
		];
		if (
			requestedEmails.some((email) => email !== callerEmail) &&
			!user.isAdmin
		) {
			throw new AppError(
				"forbidden",
				"Only an instance admin may attribute imported entries to other users",
			);
		}
		// Resolve each named author to a workspace member in one query. An email
		// that is not a member — unknown account or non-member — fails the run up
		// front with the offending line number, nothing written.
		const userIdByEmail = new Map<string, string>();
		if (requestedEmails.length > 0) {
			for (const m of await listMembers(c.var.db, input.workspaceId)) {
				userIdByEmail.set(m.email.toLowerCase(), m.userId);
			}
		}
		const resolved = input.entries.map((e, i) => {
			if (!e.user) return { entry: e, userId: user.id };
			const userId = userIdByEmail.get(e.user);
			if (!userId) {
				throw new AppError(
					"bad_request",
					`Line ${i + 1}: user "${e.user}" is not a member of this workspace`,
				);
			}
			return { entry: e, userId };
		});

		// Client-supplied primary keys: reject any externalId that already exists
		// as another user's or another workspace's entry (409, nothing written).
		// The owner is compared against the entry's resolved author, so an admin
		// re-importing a teammate's history stays idempotent.
		if (externalIds.length > 0) {
			const authorByExternalId = new Map<string, string>();
			for (const { entry, userId } of resolved) {
				if (entry.externalId) authorByExternalId.set(entry.externalId, userId);
			}
			const owners = await getWorkEntryOwnersByIds(c.var.db, externalIds);
			const foreign = owners.find(
				(o) =>
					o.workspaceId !== input.workspaceId ||
					o.userId !== authorByExternalId.get(o.id),
			);
			if (foreign) {
				throw new AppError(
					"conflict",
					`externalId "${foreign.id}" already exists and belongs to another user or workspace`,
				);
			}
		}

		const source = resolveSource(c);
		const rows = resolved.map(({ entry: e, userId }) => ({
			id: e.externalId ?? crypto.randomUUID(),
			workspaceId: input.workspaceId,
			projectId: e.projectId,
			userId,
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
		const { entry } = await requireEntryAccess(c, c.req.param("id"));
		return c.json(entry);
	})
	// The agent sessions this entry was logged from (write-only provenance made
	// readable). Requires read access to the entry, then filters linked sessions
	// by the standard agent-entry ACL so a link never widens visibility.
	.get("/:id/agent-entries", requireAgentsFeature, async (c) => {
		const { user } = requireScope(c, "read");
		const { entry, membership } = await requireEntryAccess(
			c,
			c.req.param("id"),
		);
		const access = resolveEntryAccess(entry.workspaceId, membership, user.id);
		const timezone = resolveUserTimezone(user.timezone);
		const rows = await listAgentEntriesForWorkEntry(c.var.db, {
			workEntryId: entry.id,
			workspaceId: entry.workspaceId,
			access,
		});
		return c.json(rows.map((row) => serializeAgentEntry(row, timezone)));
	})
	.patch("/:id", async (c) => {
		const { user } = requireScope(c, "write");
		const { entry } = await requireEntryAccess(c, c.req.param("id"), {
			write: true,
		});
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
		const { entry } = await requireEntryAccess(c, c.req.param("id"), {
			write: true,
		});
		requireAuthor(c, entry);
		await deleteWorkEntry(c.var.db, entry.id);
		publishToWorkspace(c, {
			type: "work-entry",
			workspaceId: entry.workspaceId,
		});
		return c.body(null, 204);
	});
