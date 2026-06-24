import { z } from "zod";

/**
 * Raw per-turn agent telemetry: one event per assistant message (one API
 * response, which carries exactly one usage block). The materialized
 * per-session rollup lives in `agent_spans`; events are the immutable source
 * the rollup is recomputed from. See `local/agent-events-design.md`.
 */

/**
 * The agent's native `message.usage` object, stored verbatim (schema-on-read).
 * Lenient on purpose: the transcript format is unversioned and unstable, so we
 * pin nothing as required and read buckets defensively downstream (via
 * json_extract on the stored JSON). For Claude Code this is the snake_case
 * usage (`input_tokens`, `cache_creation_input_tokens`, ...).
 */
export const agentEventUsageSchema = z.object({}).passthrough();
export type AgentEventUsage = z.infer<typeof agentEventUsageSchema>;

/**
 * One assistant turn: one `message.id` = one API response with one usage. The
 * client (e.g. the Claude Code Stop hook) dedupes the transcript down to one
 * event per message.id before posting — a single message.id repeats across
 * content-block lines with identical usage, so naive summation overcounts.
 */
export const agentEventSchema = z.object({
	// Transcript assistant message.id; the idempotency key within an agent.
	sourceId: z.string().min(1).max(200),
	// ISO-8601 (UTC) wall-clock time of the message.
	timestamp: z.iso.datetime(),
	model: z.string().max(100).optional(),
	usage: agentEventUsageSchema,
});
export type AgentEventInput = z.infer<typeof agentEventSchema>;

/**
 * Ingest payload: one session's events, batch-posted. Idempotent on
 * (agent, sourceId): re-sending seen events is a no-op, so the Stop hook can
 * safely re-post the whole cumulative transcript on every turn.
 * workspaceId/projectId default to the agent token's binding when omitted.
 */
export const ingestAgentEventsInputSchema = z.object({
	workspaceId: z.string().optional(),
	// Reject an empty/whitespace projectId at the boundary (mirrors agent-spans).
	projectId: z.string().trim().min(1).optional(),
	sessionId: z.string().min(1).max(200),
	events: z.array(agentEventSchema).min(1).max(5000),
});
export type IngestAgentEventsInput = z.infer<
	typeof ingestAgentEventsInputSchema
>;
export type IngestAgentEventsInputData = z.input<
	typeof ingestAgentEventsInputSchema
>;
