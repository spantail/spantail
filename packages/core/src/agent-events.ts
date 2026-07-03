import { z } from "zod";

/**
 * Raw per-turn agent telemetry: one event per assistant message (one API
 * response, which carries exactly one usage block). The materialized
 * per-session rollup lives in `agent_entries`; events are the immutable source
 * the rollup is recomputed from.
 *
 * The shape follows the OTel GenAI semantic conventions loosely (an event maps
 * to a span, `operation` to `gen_ai.operation.name`, the session to
 * `gen_ai.conversation.id`); see docs/data-model.md for the full mapping. The
 * conventions are still in Development status, so nothing here is an enum tied
 * to them.
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
 * Non-usage metadata on an event, keyed by OTel attribute names where one
 * exists (e.g. `vcs.ref.head.name` for the git branch, `app.version` for the
 * client version); see docs/data-model.md for the recommended keys. Stored
 * verbatim and read defensively (schema-on-read), like the raw usage — but
 * bounded, because ingest is the untrusted write path (docs/security.md §1).
 * Never put transcript content or source code here.
 */
export const agentEventAttributesSchema = z
	.record(
		z.string().min(1).max(100),
		z.union([z.string().max(500), z.number(), z.boolean()]),
	)
	.refine(
		(attributes) => Object.keys(attributes).length <= 20,
		"attributes must have at most 20 entries",
	);
export type AgentEventAttributes = z.infer<typeof agentEventAttributesSchema>;

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
	// What the event records, in `gen_ai.operation.name` terms ("chat" is an
	// inference turn). Free-form — the semconv values are still in flux.
	operation: z.string().min(1).max(100).default("chat"),
	model: z.string().max(100).optional(),
	usage: agentEventUsageSchema,
	// Client-provided cost (e.g. the transcript's `costUSD`), summed into the
	// session rollup. The server never computes prices itself.
	costUsd: z.number().min(0).optional(),
	attributes: agentEventAttributesSchema.optional(),
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
	// Reject an empty/whitespace projectId at the boundary (mirrors agent-entries).
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
