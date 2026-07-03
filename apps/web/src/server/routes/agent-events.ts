import {
	finalizeAgentSessionInputSchema,
	ingestAgentEventsInputSchema,
	todayInTimezone,
} from "@spantail/core";
import {
	computeSessionRollup,
	finalizeAgentSession,
	getProjectById,
	insertAgentEventsIgnoreConflicts,
	materializeAgentSessionRollup,
} from "@spantail/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import {
	requireAgentIngestWorkspace,
	requireProjectAccess,
} from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireAgentsFeature } from "../middleware/agents-feature";
import { requireAgentAuth } from "../middleware/auth";
import { ingestRateLimit } from "../middleware/rate-limit";
import { publishToWorkspace } from "../realtime/publish";
import type { AppEnv } from "../types";

export const agentEventRoutes = new Hono<AppEnv>()
	.use(requireAgentsFeature)
	// Ingest raw per-turn telemetry (agent access token only). Idempotent on
	// (agent, sourceId): re-posting the cumulative transcript every Stop is safe.
	// Each call inserts new events, then recomputes the session's rollup into
	// `agent_entries` — the same row the client-computed POST /agent-entries
	// writes, so a session is fed by one path only (Claude Code via events,
	// Cursor via the summary route) and they never collide.
	// Rate-limited per credential (the agent token): ingestion is the untrusted
	// write path.
	.post("/", ingestRateLimit, async (c) => {
		const auth = requireAgentAuth(c);
		const input = validate(ingestAgentEventsInputSchema, await c.req.json());
		const { workspaceId, membership } = await requireAgentIngestWorkspace(
			c,
			auth,
			input.workspaceId,
		);

		const projectId = input.projectId ?? null;
		if (projectId) {
			const project = await getProjectById(c.var.db, projectId);
			if (!project || project.workspaceId !== workspaceId) {
				throw new AppError(
					"bad_request",
					"Project does not belong to this workspace",
				);
			}
			// The agent's owner must belong to the project it logs into (project ACL).
			await requireProjectAccess(c, projectId, membership, auth.ownerUserId);
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
				operation: e.operation,
				model: e.model ?? null,
				usage: e.usage,
				costUsd: e.costUsd ?? null,
				attributes: e.attributes ?? null,
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

		// 3. Materialize the rollup (monotonic: a stale concurrent recompute can't
		// shrink the row). Read cost on list/stats is unchanged.
		const entry = await materializeAgentSessionRollup(c.var.db, {
			workspaceId,
			ownerUserId: auth.ownerUserId,
			projectId,
			agentId: auth.agentId,
			sessionId: input.sessionId,
			durationMinutes: rollup.durationMinutes,
			usage: rollup.usage,
			context: rollup.context,
			description: null,
			startedAt: rollup.startedAt,
			endedAt: rollup.endedAt,
		});
		publishToWorkspace(c, { type: "agent-entry", workspaceId });
		// Echo with a UTC-derived entryDate: this is the ingest path (no human
		// viewer); readers recompute the day in their own timezone.
		return c.json({
			...entry,
			entryDate: todayInTimezone("UTC", entry.startedAt),
		});
	})
	// Finalize an events-fed session (e.g. Claude Code's SessionEnd hook):
	// supplements the entry with closing facts — wall-clock end, a summary
	// description, extra context (refs) — while the usage rollup stays derived
	// from events. 404 when the session has no entry in the workspace yet
	// (SessionEnd is best-effort; the client may ignore it).
	.post("/finalize", ingestRateLimit, async (c) => {
		const auth = requireAgentAuth(c);
		const input = validate(finalizeAgentSessionInputSchema, await c.req.json());
		const { workspaceId } = await requireAgentIngestWorkspace(
			c,
			auth,
			input.workspaceId,
		);

		const entry = await finalizeAgentSession(c.var.db, {
			agentId: auth.agentId,
			workspaceId,
			sessionId: input.sessionId,
			endedAt: input.endedAt ? new Date(input.endedAt) : null,
			description: input.description ?? null,
			context: input.context ?? null,
		});
		if (!entry) {
			throw new AppError("not_found", "No entry for this session yet");
		}
		publishToWorkspace(c, { type: "agent-entry", workspaceId });
		return c.json({
			...entry,
			entryDate: todayInTimezone("UTC", entry.startedAt),
		});
	});
