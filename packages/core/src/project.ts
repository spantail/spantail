import { z } from "zod";

import { slugSchema } from "./common";

export const projectStatusSchema = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/** A project's color marker, stored as an OKLCH hue (0–359). Always set: the
 * create form picks one and the column defaults when omitted. */
export const projectHueSchema = z.number().int().min(0).max(359);

export const projectSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	slug: slugSchema,
	name: z.string().min(1).max(100),
	description: z.string().max(1000).nullable(),
	hue: projectHueSchema,
	status: projectStatusSchema,
	createdAt: z.string(),
	archivedAt: z.string().nullable(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectInputSchema = z.object({
	slug: slugSchema,
	name: z.string().min(1).max(100),
	description: z.string().max(1000).optional(),
	hue: projectHueSchema.optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z
	.object({
		name: z.string().min(1).max(100),
		slug: slugSchema,
		description: z.string().max(1000).nullable(),
		hue: projectHueSchema,
		status: projectStatusSchema,
	})
	.partial();
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
