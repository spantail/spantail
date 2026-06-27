import { z } from "zod";

import { localDateSchema } from "./common";
import { MAX_DURATION_MINUTES } from "./duration";

/** Coding-agent kind. Drives per-type grouping and ingest tooling. */
export const agentTypes = ["claude_code", "codex", "cursor", "other"] as const;
export const agentTypeSchema = z.enum(agentTypes);
export type AgentType = z.infer<typeof agentTypeSchema>;

/**
 * A registered AI coding agent. Account-scoped: it is a delegated identity of
 * one user, not an independent principal. Its entries are attributed to the
 * owner and inherit the owner's workspace visibility.
 */
export const agentSchema = z.object({
	id: z.string(),
	type: agentTypeSchema,
	name: z.string(),
	createdAt: z.string(),
	// Reversible deactivation; while set, the agent's token is rejected at ingest.
	disabledAt: z.string().nullable(),
	archivedAt: z.string().nullable(),
});
export type Agent = z.infer<typeof agentSchema>;

/**
 * Public summary of an agent's single access token (AAT). The plaintext secret
 * is shown only once at creation/rotation and never included here.
 */
export const agentTokenSummarySchema = z.object({
	defaultWorkspaceId: z.string().nullable(),
	lastUsedAt: z.string().nullable(),
	expiresAt: z.string().nullable(),
});
export type AgentTokenSummary = z.infer<typeof agentTokenSummarySchema>;

/**
 * An agent with its single bound access token and the projects it is associated
 * with. Agent and token are 1:1: the token is created with the agent and its
 * binding (default workspace) is fixed for the agent's life — changing it means
 * re-creating the agent. `projectIds` is the association set chosen at
 * registration; an empty array means "all projects" in the bound workspace.
 */
export const agentWithTokenSchema = agentSchema.extend({
	token: agentTokenSummarySchema.nullable(),
	projectIds: z.array(z.string()),
});
export type AgentWithToken = z.infer<typeof agentWithTokenSchema>;

/**
 * Creating an agent also issues its access token. A default workspace is
 * required (the token must know where to log). `projectIds` associates the
 * agent with a subset of that workspace's projects; omit or pass an empty array
 * for "all projects".
 */
export const createAgentInputSchema = z.object({
	type: agentTypeSchema,
	name: z.string().min(1).max(100),
	defaultWorkspaceId: z.string(),
	projectIds: z.array(z.string()).optional(),
	expiresInDays: z.number().int().min(1).max(3650).optional(),
});
export type CreateAgentInput = z.infer<typeof createAgentInputSchema>;

export const updateAgentInputSchema = z.object({
	disabled: z.boolean(),
});
export type UpdateAgentInput = z.infer<typeof updateAgentInputSchema>;

/**
 * Token usage for one agent session, computed client-side from the agent's
 * local transcript. Token fields are session totals; agents differ in which
 * buckets they expose, so only `totalTokens` is required. `costUsd` is recorded
 * only when the source provides it (e.g. Cursor's Admin API).
 */
export const agentUsageSchema = z.object({
	inputTokens: z.number().int().min(0).optional(),
	outputTokens: z.number().int().min(0).optional(),
	cacheCreationTokens: z.number().int().min(0).optional(),
	cacheReadTokens: z.number().int().min(0).optional(),
	totalTokens: z.number().int().min(0),
	model: z.string().max(100).optional(),
	costUsd: z.number().min(0).optional(),
});
export type AgentUsage = z.infer<typeof agentUsageSchema>;

/** One agent work session, attributed to the owning user and a workspace. */
export const agentEntrySchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	ownerUserId: z.string(),
	// Null when the project the session was logged against has been deleted.
	projectId: z.string().nullable(),
	agentId: z.string(),
	// External session identifier (CC session_id / Codex thread / Cursor convo).
	sessionId: z.string(),
	entryDate: localDateSchema,
	durationMinutes: z.number().int().min(0).max(MAX_DURATION_MINUTES),
	// Null when the source can't expose token usage locally (e.g. Cursor).
	usage: agentUsageSchema.nullable(),
	description: z.string().max(2000).nullable(),
	startedAt: z.string().nullable(),
	endedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type AgentEntry = z.infer<typeof agentEntrySchema>;

/**
 * Ingest payload for one session. Idempotent on (agent, sessionId): re-sending
 * the same session updates the row rather than inserting a duplicate, so retries
 * and daily batch reconciliation never double-count. workspaceId/projectId
 * default to the token's binding when omitted.
 */
export const ingestAgentEntryInputSchema = z.object({
	workspaceId: z.string().optional(),
	// Reject an empty/whitespace projectId at the boundary: a falsy-but-present
	// value would otherwise skip the FK check and 500 on insert instead of 400.
	projectId: z.string().trim().min(1).optional(),
	sessionId: z.string().min(1).max(200),
	durationMinutes: z.number().int().min(0).max(MAX_DURATION_MINUTES),
	usage: agentUsageSchema.optional(),
	description: z.string().max(2000).optional(),
	startedAt: z.iso.datetime().optional(),
	endedAt: z.iso.datetime().optional(),
});
export type IngestAgentEntryInput = z.infer<typeof ingestAgentEntryInputSchema>;
export type IngestAgentEntryInputData = z.input<
	typeof ingestAgentEntryInputSchema
>;

export const listAgentEntriesQuerySchema = z.object({
	workspaceId: z.string(),
	agentId: z.string().optional(),
	from: localDateSchema.optional(),
	to: localDateSchema.optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});
export type ListAgentEntriesQuery = z.infer<typeof listAgentEntriesQuerySchema>;
export type ListAgentEntriesQueryData = Omit<
	z.input<typeof listAgentEntriesQuerySchema>,
	"limit" | "offset"
> & { limit?: number; offset?: number };

const statBucketFields = {
	minutes: z.number().int().min(0),
	tokens: z.number().int().min(0),
	count: z.number().int().min(0),
};

/** Aggregated agent-entry stats for the same filter as the list endpoint. */
export const agentEntryStatsSchema = z.object({
	totalMinutes: z.number().int().min(0),
	totalTokens: z.number().int().min(0),
	// Input/output split of totalTokens, for the agent screen's Tokens widget.
	// Agents that don't expose buckets contribute 0, so their sum can be < totalTokens.
	totalInputTokens: z.number().int().min(0),
	totalOutputTokens: z.number().int().min(0),
	entryCount: z.number().int().min(0),
	byDate: z.array(
		z.object({
			date: localDateSchema,
			...statBucketFields,
			inputTokens: z.number().int().min(0),
			outputTokens: z.number().int().min(0),
		}),
	),
	byAgent: z.array(z.object({ agentId: z.string(), ...statBucketFields })),
});
export type AgentEntryStats = z.infer<typeof agentEntryStatsSchema>;

export const agentEntryStatsQuerySchema = listAgentEntriesQuerySchema.omit({
	limit: true,
	offset: true,
});
export type AgentEntryStatsQuery = z.infer<typeof agentEntryStatsQuerySchema>;
