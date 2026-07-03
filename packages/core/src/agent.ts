import { z } from "zod";

import { isTimestampInRange, localDateSchema } from "./common";
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

/** Bounded list of distinct context values (models, branches, refs, ...). */
const contextValuesSchema = z.array(z.string().min(1).max(200)).max(20);

/**
 * Non-usage session context: distinct values aggregated from event attributes
 * by the rollup (`models`, `branches`, `repositories`) or supplied by the
 * client (`refs`, and everything on the summary/finalize paths). `refs` are
 * opaque external references extracted by the client (e.g.
 * "github:owner/repo#123") — the server never interprets the format.
 */
export const agentEntryContextSchema = z.object({
	models: contextValuesSchema.optional(),
	branches: contextValuesSchema.optional(),
	repositories: contextValuesSchema.optional(),
	refs: contextValuesSchema.optional(),
});
export type AgentEntryContext = z.infer<typeof agentEntryContextSchema>;

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
	// Derived at read time: the local date of `startedAt` in the requesting
	// user's timezone. Agent sessions store only timestamps (no frozen date), so
	// a midnight-spanning session lands on the correct day for whoever is viewing.
	entryDate: localDateSchema,
	durationMinutes: z.number().int().min(0).max(MAX_DURATION_MINUTES),
	// Null when the source can't expose token usage locally (e.g. Cursor).
	usage: agentUsageSchema.nullable(),
	context: agentEntryContextSchema.nullable(),
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
export const ingestAgentEntryInputSchema = z
	.object({
		workspaceId: z.string().optional(),
		// Reject an empty/whitespace projectId at the boundary: a falsy-but-present
		// value would otherwise skip the FK check and 500 on insert instead of 400.
		projectId: z.string().trim().min(1).optional(),
		sessionId: z.string().min(1).max(200),
		durationMinutes: z.number().int().min(0).max(MAX_DURATION_MINUTES),
		usage: agentUsageSchema.optional(),
		context: agentEntryContextSchema.optional(),
		description: z.string().max(2000).optional(),
		// Format alone is not enough: a leaked write-only token could backdate to
		// 1970 or forward-date far into the future. `startedAt` is the instant the
		// session's day is derived from at read time, so bound the range too.
		startedAt: z.iso
			.datetime()
			.refine(isTimestampInRange, "must be a plausible timestamp")
			.optional(),
		endedAt: z.iso
			.datetime()
			.refine(isTimestampInRange, "must be a plausible timestamp")
			.optional(),
	})
	.superRefine((input, ctx) => {
		if (
			input.startedAt &&
			input.endedAt &&
			Date.parse(input.endedAt) < Date.parse(input.startedAt)
		) {
			ctx.addIssue({
				code: "custom",
				message: "endedAt must not be before startedAt",
				path: ["endedAt"],
			});
		}
	});
export type IngestAgentEntryInput = z.infer<typeof ingestAgentEntryInputSchema>;
export type IngestAgentEntryInputData = z.input<
	typeof ingestAgentEntryInputSchema
>;

/**
 * Finalize payload for an events-fed session (e.g. Claude Code's SessionEnd
 * hook): supplements the entry with closing facts — the wall-clock end, a
 * summary description, extra context — without touching the usage rollup,
 * which stays derived from events. The session must already have an entry
 * (events arrived first); finalizing an unknown session is a 404 the client
 * may ignore, since SessionEnd is best-effort anyway.
 */
export const finalizeAgentSessionInputSchema = z.object({
	workspaceId: z.string().optional(),
	sessionId: z.string().min(1).max(200),
	// Bounded like the summary path's timestamps: a leaked write-only token
	// must not date a session far into the past or future.
	endedAt: z.iso
		.datetime()
		.refine(isTimestampInRange, "must be a plausible timestamp")
		.optional(),
	description: z.string().max(2000).optional(),
	context: agentEntryContextSchema.optional(),
});
export type FinalizeAgentSessionInput = z.infer<
	typeof finalizeAgentSessionInputSchema
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

// Stats scan every matching row to bucket by day in the viewer's timezone, so
// the date window is required (unlike the paginated list) — it bounds the scan.
export const agentEntryStatsQuerySchema = listAgentEntriesQuerySchema
	.omit({ limit: true, offset: true })
	.required({ from: true, to: true });
export type AgentEntryStatsQuery = z.infer<typeof agentEntryStatsQuerySchema>;
