import { z } from "zod";

import { localDateSchema } from "./common";

export const tagSchema = z.string().min(1).max(50);

/** Client channel a work span was created through. Server-determined, not user input. */
export const workSpanSources = ["web", "cli", "mcp", "api"] as const;
export const workSpanSourceSchema = z.enum(workSpanSources);
export type WorkSpanSource = z.infer<typeof workSpanSourceSchema>;

export const workSpanSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	// Null when the project the span was logged against has been deleted.
	projectId: z.string().nullable(),
	userId: z.string(),
	spanDate: localDateSchema,
	durationMinutes: z.number().int().positive(),
	startedAt: z.string().nullable(),
	endedAt: z.string().nullable(),
	description: z.string().min(1).max(2000),
	note: z.string().max(10000).nullable(),
	tags: z.array(tagSchema).max(20),
	source: workSpanSourceSchema,
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type WorkSpan = z.infer<typeof workSpanSchema>;

export const createWorkSpanInputSchema = z.object({
	workspaceId: z.string(),
	projectId: z.string(),
	// Defaults to today in the workspace's timezone when omitted.
	spanDate: localDateSchema.optional(),
	durationMinutes: z.number().int().positive(),
	startedAt: z.iso.datetime().optional(),
	endedAt: z.iso.datetime().optional(),
	description: z.string().min(1).max(2000),
	note: z.string().max(10000).optional(),
	tags: z.array(tagSchema).max(20).default([]),
});
export type CreateWorkSpanInput = z.infer<typeof createWorkSpanInputSchema>;
export type CreateWorkSpanInputData = z.input<typeof createWorkSpanInputSchema>;

export const updateWorkSpanInputSchema = z
	.object({
		// Nullable so an span orphaned by a project deletion can be edited
		// without being forced to reassign a project.
		projectId: z.string().nullable(),
		spanDate: localDateSchema,
		durationMinutes: z.number().int().positive(),
		startedAt: z.iso.datetime().nullable(),
		endedAt: z.iso.datetime().nullable(),
		description: z.string().min(1).max(2000),
		note: z.string().max(10000).nullable(),
		tags: z.array(tagSchema).max(20),
	})
	.partial();
export type UpdateWorkSpanInput = z.infer<typeof updateWorkSpanInputSchema>;

const statBucketFields = {
	minutes: z.number().int().min(0),
	count: z.number().int().min(0),
};

/** Aggregated work-span stats for an arbitrary list-style filter. */
export const workSpanStatsSchema = z.object({
	totalMinutes: z.number().int().min(0),
	spanCount: z.number().int().min(0),
	// Ascending by date; only dates that have spans (clients zero-fill).
	byDate: z.array(z.object({ date: localDateSchema, ...statBucketFields })),
	// Descending by minutes. projectId is null for spans whose project was deleted.
	byProject: z.array(
		z.object({ projectId: z.string().nullable(), ...statBucketFields }),
	),
	byUser: z.array(z.object({ userId: z.string(), ...statBucketFields })),
});
export type WorkSpanStats = z.infer<typeof workSpanStatsSchema>;

export const listWorkSpansQuerySchema = z.object({
	workspaceId: z.string(),
	projectId: z.string().optional(),
	userId: z.string().optional(),
	tag: tagSchema.optional(),
	from: localDateSchema.optional(),
	to: localDateSchema.optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});
export type ListWorkSpansQuery = z.infer<typeof listWorkSpansQuerySchema>;
// z.coerce fields have an `unknown` input type; clients send numbers.
export type ListWorkSpansQueryData = Omit<
	z.input<typeof listWorkSpansQuerySchema>,
	"limit" | "offset"
> & { limit?: number; offset?: number };

export const workSpanStatsQuerySchema = listWorkSpansQuerySchema.omit({
	limit: true,
	offset: true,
});
// No coerce fields remain after the omit, so infer doubles as the input type.
export type WorkSpanStatsQuery = z.infer<typeof workSpanStatsQuerySchema>;

// Distinct tags in scope, for populating the tag filter dropdown.
export const workSpanTagsQuerySchema = z.object({
	workspaceId: z.string(),
	projectId: z.string().optional(),
});
export type WorkSpanTagsQuery = z.infer<typeof workSpanTagsQuerySchema>;
