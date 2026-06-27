import { z } from "zod";

import { localDateSchema } from "./common";
import { MAX_DURATION_MINUTES } from "./duration";

export const tagSchema = z.string().min(1).max(50);

/** Client channel a work entry was created through. Server-determined, not user input. */
export const workEntrySources = ["web", "cli", "mcp", "api"] as const;
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
});
export type CreateWorkEntryInput = z.infer<typeof createWorkEntryInputSchema>;
export type CreateWorkEntryInputData = z.input<
	typeof createWorkEntryInputSchema
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
