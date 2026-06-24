import {
	agentSpanStatsQuerySchema,
	ingestAgentSpanInputSchema,
	listAgentSpansQuerySchema,
	todayInTimezone,
} from "@spantail/core";
import {
	getAgentSpanStats,
	getMembership,
	getProjectById,
	getWorkspaceById,
	listAgentSpans,
	listWorkspaceAgents,
	upsertAgentSpan,
} from "@spantail/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { requireWorkspaceAccess } from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireAgentsFeature } from "../middleware/agents-feature";
import { requireAgentAuth, requireScope } from "../middleware/auth";
import type { AppEnv } from "../types";

export const agentSpanRoutes = new Hono<AppEnv>()
	.use(requireAgentsFeature)
	// Ingest (agent access token only). Idempotent on (agent, sessionId).
	.post("/", async (c) => {
		const auth = requireAgentAuth(c);
		const input = validate(ingestAgentSpanInputSchema, await c.req.json());

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
		}

		const startedAt = input.startedAt ? new Date(input.startedAt) : null;
		const span = await upsertAgentSpan(c.var.db, {
			workspaceId,
			ownerUserId: auth.ownerUserId,
			projectId: projectId ?? null,
			agentId: auth.agentId,
			sessionId: input.sessionId,
			// The session's local date in the workspace timezone (from its start).
			spanDate: todayInTimezone(workspace.timezone, startedAt ?? undefined),
			durationMinutes: input.durationMinutes,
			usage: input.usage ?? null,
			description: input.description ?? null,
			startedAt,
			endedAt: input.endedAt ? new Date(input.endedAt) : null,
		});
		return c.json(span);
	})
	// Reads are scoped to the caller's own agents: an agent acts for one user,
	// and members only see their own agents' activity (ownerUserId is fixed to
	// the caller server-side — not a client-supplied filter — so it can't be
	// spoofed to read another member's data).
	.get("/", async (c) => {
		const auth = requireScope(c, "read");
		const query = validate(listAgentSpansQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		return c.json(
			await listAgentSpans(c.var.db, {
				...query,
				ownerUserId: auth.user.id,
			}),
		);
	})
	.get("/stats", async (c) => {
		const auth = requireScope(c, "read");
		const query = validate(agentSpanStatsQuerySchema, c.req.query());
		await requireWorkspaceAccess(c, query.workspaceId);
		return c.json(
			await getAgentSpanStats(c.var.db, {
				...query,
				ownerUserId: auth.user.id,
			}),
		);
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
