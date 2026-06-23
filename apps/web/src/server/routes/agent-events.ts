import { ingestAgentEventsInputSchema, todayInTimezone } from "@toxil/core";
import {
	computeSessionRollup,
	getMembership,
	getProjectById,
	getWorkspaceById,
	insertAgentEventsIgnoreConflicts,
	upsertAgentEntry,
} from "@toxil/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import { requireAgentsFeature } from "../middleware/agents-feature";
import { requireAgentAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const agentEventRoutes = new Hono<AppEnv>()
	.use(requireAgentsFeature)
	// Ingest raw per-turn telemetry (agent access token only). Idempotent on
	// (agent, sourceId): re-posting the cumulative transcript every Stop is safe.
	// Each call inserts new events, then recomputes the session's rollup into
	// `agent_entries` — the same row the client-computed POST /agent-entries
	// writes, so a session is fed by one path only (Claude Code via events,
	// Cursor via the summary route) and they never collide.
	.post("/", async (c) => {
		const auth = requireAgentAuth(c);
		const input = validate(ingestAgentEventsInputSchema, await c.req.json());

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

		// 1. Idempotently insert this session's events.
		await insertAgentEventsIgnoreConflicts(
			c.var.db,
			input.events.map((e) => ({
				agentId: auth.agentId,
				workspaceId,
				sessionId: input.sessionId,
				sourceId: e.sourceId,
				timestamp: new Date(e.timestamp),
				model: e.model ?? null,
				usage: e.usage,
			})),
		);

		// 2. Recompute the rollup from THIS session's events only (recompute, not
		// increment — so retries and re-sends converge to the same totals).
		const rollup = await computeSessionRollup(
			c.var.db,
			auth.agentId,
			input.sessionId,
		);
		if (!rollup) {
			throw new AppError("bad_request", "No usable events in payload");
		}

		// 3. Materialize via the existing entry upsert path (read cost unchanged).
		const entry = await upsertAgentEntry(c.var.db, {
			workspaceId,
			ownerUserId: auth.ownerUserId,
			projectId,
			agentId: auth.agentId,
			sessionId: input.sessionId,
			entryDate: todayInTimezone(workspace.timezone, rollup.startedAt),
			durationMinutes: rollup.durationMinutes,
			usage: rollup.usage,
			description: null,
			startedAt: rollup.startedAt,
			endedAt: rollup.endedAt,
		});
		return c.json(entry);
	});
