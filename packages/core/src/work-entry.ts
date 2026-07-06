import { z } from "zod";

import { localDateSchema } from "./common";
import { MAX_DURATION_MINUTES } from "./duration";

export const tagSchema = z.string().min(1).max(50);

/** Client channel a work entry was created through. Server-determined, not user input. */
export const workEntrySources = ["web", "cli", "mcp", "api", "github"] as const;
export const workEntrySourceSchema = z.enum(workEntrySources);
export type WorkEntrySource = z.infer<typeof workEntrySourceSchema>;

export const workEntrySchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	// Null when the project the entry was logged against has been deleted.
	projectId: z.string().nullable(),
	userId: z.string(),
	entryDate: localDateSchema,
	durationMinutes: z.number().int().positive().max(MAX_DURATION_MINUTES),
	startedAt: z.string().nullable(),
	endedAt: z.string().nullable(),
	description: z.string().min(1).max(2000),
	note: z.string().max(10000).nullable(),
	tags: z.array(tagSchema).max(20),
	source: workEntrySourceSchema,
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type WorkEntry = z.infer<typeof workEntrySchema>;

/**
 * Agent entries one work entry can be created from. Each link binds 2
 * parameters against D1's 100-bound-parameter cap, and the ownership
 * pre-check selects the same ids in one statement.
 */
export const MAX_LINKED_AGENT_ENTRIES = 50;

export const createWorkEntryInputSchema = z.object({
	workspaceId: z.string(),
	projectId: z.string(),
	// Defaults to today in the author's timezone when omitted.
	entryDate: localDateSchema.optional(),
	durationMinutes: z.number().int().positive().max(MAX_DURATION_MINUTES),
	startedAt: z.iso.datetime().optional(),
	endedAt: z.iso.datetime().optional(),
	description: z.string().min(1).max(2000),
	note: z.string().max(10000).optional(),
	tags: z.array(tagSchema).max(20).default([]),
	// Agent entries this work entry was logged from; must be the caller's own.
	agentEntryIds: z.array(z.string()).max(MAX_LINKED_AGENT_ENTRIES).optional(),
});
export type CreateWorkEntryInput = z.infer<typeof createWorkEntryInputSchema>;
export type CreateWorkEntryInputData = z.input<
	typeof createWorkEntryInputSchema
>;

/**
 * Sized for the tightest D1 budget the app supports (Workers Free: 50 queries
 * per invocation). A work-entry row binds 12 columns against the 100-bound-
 * parameter cap, so inserts are chunked at 8 rows per statement — 100 entries
 * = 13 statements in one db.batch, leaving room for the request's auth,
 * permission, and ownership queries. Clients importing more auto-split into
 * multiple requests.
 */
export const MAX_WORK_ENTRIES_PER_BATCH = 100;

/**
 * Distinct projects per batch request: each costs two permission lookups, so
 * this bounds the request's share of the same Free-plan query budget.
 */
export const MAX_PROJECTS_PER_BATCH = 10;

// Ids that could never be addressed as /work-entries/:id — the collection
// sub-routes are matched before /:id, and "." / ".." are URL dot-segments
// that normalize away before routing.
const RESERVED_WORK_ENTRY_IDS = new Set(["stats", "tags", "batch", ".", ".."]);

// Becomes the entry's primary key (and thus appears in /:id URLs), so the
// charset is restricted to URL-safe id characters, route segments are
// reserved, and path dot-segments are rejected.
export const externalIdSchema = z
	.string()
	.regex(/^[A-Za-z0-9._:-]{1,200}$/)
	.refine((id) => !RESERVED_WORK_ENTRY_IDS.has(id), {
		message:
			'reserved id; "stats", "tags", "batch", ".", and ".." cannot address an entry',
	});

// The single-create input minus workspaceId (lifted to the request top level)
// and agentEntryIds (linking is a web-create concern, not an import one), with
// entryDate required — a migration must state dates explicitly — and an
// optional externalId as the idempotency key (same id ⇒ upsert, not duplicate).
export const batchWorkEntryItemSchema = createWorkEntryInputSchema
	.omit({ workspaceId: true, agentEntryIds: true })
	.extend({
		entryDate: localDateSchema,
		externalId: externalIdSchema.optional(),
	});
export type BatchWorkEntryItem = z.infer<typeof batchWorkEntryItemSchema>;
export type BatchWorkEntryItemData = z.input<typeof batchWorkEntryItemSchema>;

export const createWorkEntriesBatchInputSchema = z.object({
	workspaceId: z.string(),
	entries: z
		.array(batchWorkEntryItemSchema)
		.min(1)
		.max(MAX_WORK_ENTRIES_PER_BATCH),
});
export type CreateWorkEntriesBatchInput = z.infer<
	typeof createWorkEntriesBatchInputSchema
>;
export type CreateWorkEntriesBatchInputData = z.input<
	typeof createWorkEntriesBatchInputSchema
>;

export const createWorkEntriesBatchResultSchema = z.object({
	// Entries processed (created or updated).
	count: z.number().int().min(1),
});
export type CreateWorkEntriesBatchResult = z.infer<
	typeof createWorkEntriesBatchResultSchema
>;

export const updateWorkEntryInputSchema = z
	.object({
		// Nullable so an entry orphaned by a project deletion can be edited
		// without being forced to reassign a project.
		projectId: z.string().nullable(),
		entryDate: localDateSchema,
		durationMinutes: z.number().int().positive().max(MAX_DURATION_MINUTES),
		startedAt: z.iso.datetime().nullable(),
		endedAt: z.iso.datetime().nullable(),
		description: z.string().min(1).max(2000),
		note: z.string().max(10000).nullable(),
		tags: z.array(tagSchema).max(20),
	})
	.partial();
export type UpdateWorkEntryInput = z.infer<typeof updateWorkEntryInputSchema>;

const statBucketFields = {
	minutes: z.number().int().min(0),
	count: z.number().int().min(0),
};

/** Aggregated work-entry stats for an arbitrary list-style filter. */
export const workEntryStatsSchema = z.object({
	totalMinutes: z.number().int().min(0),
	entryCount: z.number().int().min(0),
	// Ascending by date; only dates that have entries (clients zero-fill).
	byDate: z.array(z.object({ date: localDateSchema, ...statBucketFields })),
	// Descending by minutes. projectId is null for entries whose project was deleted.
	byProject: z.array(
		z.object({ projectId: z.string().nullable(), ...statBucketFields }),
	),
	byUser: z.array(z.object({ userId: z.string(), ...statBucketFields })),
});
export type WorkEntryStats = z.infer<typeof workEntryStatsSchema>;

export const listWorkEntriesQuerySchema = z.object({
	workspaceId: z.string(),
	projectId: z.string().optional(),
	userId: z.string().optional(),
	tag: tagSchema.optional(),
	from: localDateSchema.optional(),
	to: localDateSchema.optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});
export type ListWorkEntriesQuery = z.infer<typeof listWorkEntriesQuerySchema>;
// z.coerce fields have an `unknown` input type; clients send numbers.
export type ListWorkEntriesQueryData = Omit<
	z.input<typeof listWorkEntriesQuerySchema>,
	"limit" | "offset"
> & { limit?: number; offset?: number };

export const workEntryStatsQuerySchema = listWorkEntriesQuerySchema.omit({
	limit: true,
	offset: true,
});
// No coerce fields remain after the omit, so infer doubles as the input type.
export type WorkEntryStatsQuery = z.infer<typeof workEntryStatsQuerySchema>;

// Distinct tags in scope, for populating the tag filter dropdown.
export const workEntryTagsQuerySchema = z.object({
	workspaceId: z.string(),
	projectId: z.string().optional(),
});
export type WorkEntryTagsQuery = z.infer<typeof workEntryTagsQuerySchema>;
