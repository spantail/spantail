import {
	agentEntryStatsQuerySchema,
	ingestAgentEntryInputSchema,
	listAgentEntriesQuerySchema,
	todayInTimezone,
} from "@spantail/core";
import {
	getAgentEntryStats,
	getMembership,
	getProjectById,
	getWorkspaceById,
	listAgentEntries,
	listWorkspaceAgents,
	upsertAgentEntry,
} from "@spantail/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import {
	requireProjectAccess,
	requireWorkspaceAccess,
	resolveAgentEntryAccess,
} from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireAgentsFeature } from "../middleware/agents-feature";
import { requireAgentAuth, requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

export const agentEntryRoutes = new Hono<AppEnv>()
	.use(requireAgentsFeature)
	// Ingest (agent access token only). Idempotent on (agent, sessionId).
	.post("/", async (c) => {
		const auth = requireAgentAuth(c);
		const input = validate(ingestAgentEntryInputSchema, await c.req.json());

		const workspaceId = input.workspaceId ?? auth.defaultWorkspaceId;
		if (!workspaceId) {
			throw new AppError(
				"bad_request",
				"No workspace: provide workspaceId or bind a default to the token",
			);
		}
		// Live delegation check: the agent may only write where its owner is
		// currently a member, even if the token was bound earlier.
		const workspace = await getWorkspaceById(c.var.db, workspaceId);
		const membership = workspace
			? await getMembership(c.var.db, workspaceId, auth.ownerUserId)
			: undefined;
		if (!workspace || !membership) {
			throw new AppError(
				"forbidden",
				"The agent's owner is not a member of this workspace",
			);
		}

		// A project is recorded only when the ingest names one; there is no
		// token-level default. An omitted project records workspace-level work.
		const projectId = input.projectId ?? null;
		if (projectId) {
			const project = await getProjectById(c.var.db, projectId);
			if (!project || project.workspaceId !== workspaceId) {
				throw new AppError(
					"bad_request",
					"Project does not belong to this workspace",
				);
			}
			// The agent's owner must belong to the project it logs into, so the
			// owner can read back the activity (project ACL).
			await requireProjectAccess(c, projectId, membership, auth.ownerUserId);
		}

		const startedAt = input.startedAt ? new Date(input.startedAt) : null;
		const entry = await upsertAgentEntry(c.var.db, {
			workspaceId,
			ownerUserId: auth.ownerUserId,
			projectId: projectId ?? null,
			agentId: auth.agentId,
			sessionId: input.sessionId,
			// The session's local date in the workspace timezone (from its start).
			entryDate: todayInTimezone(workspace.timezone, startedAt ?? undefined),
			durationMinutes: input.durationMinutes,
			usage: input.usage ?? null,
			description: input.description ?? null,
			startedAt,
			endedAt: input.endedAt ? new Date(input.endedAt) : null,
		});
		return c.json(entry);
	})
	// Reads follow the project ACL: a caller sees agent activity in the projects
	// they belong to (workspace admins see all), plus their own agents' activity
	// (unassigned activity is workspace-scoped). The access scope is resolved
	// server-side, so it can't be spoofed to read another member's private data.
	.get("/", async (c) => {
		const auth = requireScope(c, "read");
		const query = validate(listAgentEntriesQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		const access = resolveAgentEntryAccess(auth.user.id);
		return c.json(await listAgentEntries(c.var.db, { ...query, access }));
	})
	.get("/stats", async (c) => {
		const auth = requireScope(c, "read");
		const query = validate(agentEntryStatsQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		const access = resolveAgentEntryAccess(auth.user.id);
		return c.json(await getAgentEntryStats(c.var.db, { ...query, access }));
	})
	// The caller's own agents, shown under a workspace in the sidebar: those with
	// activity here plus the ones registered to this workspace.
	.get("/agents", async (c) => {
		const auth = requireScope(c, "read");
		const workspaceId = c.req.query("workspaceId");
		if (!workspaceId) {
			throw new AppError("bad_request", "workspaceId is required");
		}
		await requireWorkspaceAccess(c, workspaceId);
		return c.json(
			await listWorkspaceAgents(c.var.db, workspaceId, auth.user.id),
		);
	});
