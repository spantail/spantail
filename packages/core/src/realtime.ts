import { z } from "zod";

/**
 * A lightweight cache-invalidation signal pushed to clients over SSE. It names
 * what changed (and where) — never the changed data itself. Clients re-fetch the
 * affected queries through the typed API, so authorization and shaping stay on
 * the existing REST path and the realtime hub holds no business logic.
 */
export const realtimeEventSchema = z.object({
	type: z.enum([
		"work-entry",
		"agent-entry",
		"project",
		"report-discussion",
		"message",
	]),
	// Set for workspace-scoped signals; absent for user-scoped ones ("message" is
	// the mailbox / report_deliveries, which spans a user's workspaces).
	workspaceId: z.string().optional(),
	// The affected entity id when a client invalidates per-id (e.g. a report's
	// discussion keyed by reportId).
	id: z.string().optional(),
});
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeEventType = RealtimeEvent["type"];
