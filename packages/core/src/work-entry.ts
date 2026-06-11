import { z } from "zod";

import { localDateSchema } from "./common";

export const tagSchema = z.string().min(1).max(50);

export const workEntrySchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	projectId: z.string(),
	userId: z.string(),
	entryDate: localDateSchema,
	durationMinutes: z.number().int().positive(),
	startedAt: z.string().nullable(),
	endedAt: z.string().nullable(),
	description: z.string().min(1).max(2000),
	note: z.string().max(10000).nullable(),
	tags: z.array(tagSchema).max(20),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type WorkEntry = z.infer<typeof workEntrySchema>;

export const createWorkEntryInputSchema = z.object({
	workspaceId: z.string(),
	projectId: z.string(),
	// Defaults to today in the workspace's timezone when omitted.
	entryDate: localDateSchema.optional(),
	durationMinutes: z.number().int().positive(),
	startedAt: z.iso.datetime().optional(),
	endedAt: z.iso.datetime().optional(),
	description: z.string().min(1).max(2000),
	note: z.string().max(10000).optional(),
	tags: z.array(tagSchema).max(20).default([]),
});
export type CreateWorkEntryInput = z.infer<typeof createWorkEntryInputSchema>;

export const updateWorkEntryInputSchema = z
	.object({
		projectId: z.string(),
		entryDate: localDateSchema,
		durationMinutes: z.number().int().positive(),
		startedAt: z.iso.datetime().nullable(),
		endedAt: z.iso.datetime().nullable(),
		description: z.string().min(1).max(2000),
		note: z.string().max(10000).nullable(),
		tags: z.array(tagSchema).max(20),
	})
	.partial();
export type UpdateWorkEntryInput = z.infer<typeof updateWorkEntryInputSchema>;

export const listWorkEntriesQuerySchema = z.object({
	workspaceId: z.string(),
	projectId: z.string().optional(),
	userId: z.string().optional(),
	from: localDateSchema.optional(),
	to: localDateSchema.optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});
export type ListWorkEntriesQuery = z.infer<typeof listWorkEntriesQuerySchema>;
