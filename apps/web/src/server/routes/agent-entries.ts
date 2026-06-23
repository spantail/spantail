import {
	agentEntryStatsQuerySchema,
	ingestAgentEntryInputSchema,
	listAgentEntriesQuerySchema,
	todayInTimezone,
} from "@toxil/core";
import {
	getAgentEntryStats,
	getMembership,
	getProjectById,
	getWorkspaceById,
	listAgentEntries,
	listAgentsWithActivity,
	upsertAgentEntry,
} from "@toxil/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
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

		// The token's default project belongs to its default workspace, so it only
		// applies when the resolved workspace is that one. An explicit workspace
		// override drops the default project (the caller may still pass its own),
		// keeping unprojected cross-workspace ingest possible.
		const defaultProjectId =
			workspaceId === auth.defaultWorkspaceId ? auth.defaultProjectId : null;
		const projectId = input.projectId ?? defaultProjectId;
		if (projectId) {
			const project = await getProjectById(c.var.db, projectId);
			if (!project || project.workspaceId !== workspaceId) {
				throw new AppError(
					"bad_request",
					"Project does not belong to this workspace",
				);
			}
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
	.get("/", async (c) => {
		requireScope(c, "read");
		const query = validate(listAgentEntriesQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		return c.json(await listAgentEntries(c.var.db, query));
	})
	.get("/stats", async (c) => {
		requireScope(c, "read");
		const query = validate(agentEntryStatsQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		return c.json(await getAgentEntryStats(c.var.db, query));
	})
	// Agents with activity in a workspace; powers the sidebar's Agents group.
	.get("/agents", async (c) => {
		requireScope(c, "read");
		const workspaceId = c.req.query("workspaceId");
		if (!workspaceId) {
			throw new AppError("bad_request", "workspaceId is required");
		}
		await requireWorkspaceAccess(c, workspaceId);
		return c.json(await listAgentsWithActivity(c.var.db, workspaceId));
	});
