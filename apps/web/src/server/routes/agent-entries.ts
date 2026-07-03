import {
	agentEntryStatsQuerySchema,
	ingestAgentEntryInputSchema,
	listAgentEntriesQuerySchema,
	resolveUserTimezone,
	todayInTimezone,
} from "@spantail/core";
import {
	type AgentEntryRow,
	getAgentEntryStats,
	getProjectById,
	listAgentEntries,
	listWorkspaceAgents,
	upsertAgentEntry,
} from "@spantail/db";
import { Hono } from "hono";

import { AppError } from "../lib/errors";
import {
	requireAgentIngestWorkspace,
	requireProjectAccess,
	requireWorkspaceAccess,
	resolveEntryAccess,
} from "../lib/permissions";
import { validate } from "../lib/validate";
import { requireAgentsFeature } from "../middleware/agents-feature";
import { requireAgentAuth, requireScope } from "../middleware/auth";
import { ingestRateLimit } from "../middleware/rate-limit";
import { publishToWorkspace } from "../realtime/publish";
import type { AppEnv } from "../types";

// Agent entries store only timestamps; `entryDate` is a read-time projection of
// `startedAt` into the viewer's timezone (UTC for the ingest echo, where there
// is no human viewer — readers recompute it in their own timezone).
function serializeAgentEntry(row: AgentEntryRow, timezone: string) {
	return { ...row, entryDate: todayInTimezone(timezone, row.startedAt) };
}

export const agentEntryRoutes = new Hono<AppEnv>()
	.use(requireAgentsFeature)
	// Ingest (agent access token only). Idempotent on (agent, sessionId).
	// Rate-limited per credential (the agent token): ingestion is the untrusted
	// write path.
	.post("/", ingestRateLimit, async (c) => {
		const auth = requireAgentAuth(c);
		const input = validate(ingestAgentEntryInputSchema, await c.req.json());
		const { workspaceId, membership } = await requireAgentIngestWorkspace(
			c,
			auth,
			input.workspaceId,
		);

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

		// Agent sessions are always timestamped; the calendar day is derived from
		// startedAt at read time. When the source omits startedAt, fall back to
		// endedAt (so startedAt never lands after endedAt), else to ingest time.
		const startedAt = input.startedAt
			? new Date(input.startedAt)
			: input.endedAt
				? new Date(input.endedAt)
				: new Date();
		const entry = await upsertAgentEntry(c.var.db, {
			workspaceId,
			ownerUserId: auth.ownerUserId,
			projectId: projectId ?? null,
			agentId: auth.agentId,
			sessionId: input.sessionId,
			durationMinutes: input.durationMinutes,
			usage: input.usage ?? null,
			context: input.context ?? null,
			description: input.description ?? null,
			startedAt,
			endedAt: input.endedAt ? new Date(input.endedAt) : null,
		});
		publishToWorkspace(c, { type: "agent-entry", workspaceId });
		return c.json(serializeAgentEntry(entry, resolveUserTimezone(null)));
	})
	// Reads follow the project ACL: a member sees agent activity in the projects
	// they belong to plus their own agents' activity (unassigned activity stays
	// owner-only). A workspace/instance admin reads all agent activity in the
	// workspace (matrix `R`/`R*`). The access scope is resolved server-side from
	// the caller's membership, so it can't be spoofed to widen the read.
	.get("/", async (c) => {
		const auth = requireScope(c, "read");
		const query = validate(listAgentEntriesQuerySchema, c.req.query());
		const { membership } = await requireWorkspaceAccess(c, query.workspaceId);
		const access = resolveEntryAccess(
			query.workspaceId,
			membership,
			auth.user.id,
		);
		const timezone = resolveUserTimezone(auth.user.timezone);
		const rows = await listAgentEntries(c.var.db, {
			...query,
			timezone,
			access,
		});
		return c.json(rows.map((row) => serializeAgentEntry(row, timezone)));
	})
	.get("/stats", async (c) => {
		const auth = requireScope(c, "read");
		const query = validate(agentEntryStatsQuerySchema, c.req.query());
		const { membership } = await requireWorkspaceAccess(c, query.workspaceId);
		const access = resolveEntryAccess(
			query.workspaceId,
			membership,
			auth.user.id,
		);
		return c.json(
			await getAgentEntryStats(c.var.db, {
				...query,
				timezone: resolveUserTimezone(auth.user.timezone),
				access,
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
