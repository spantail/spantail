import { z } from "zod";

import { slugSchema, timezoneSchema } from "./common";

export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const workspaceSchema = z.object({
	id: z.string(),
	slug: slugSchema,
	name: z.string().min(1).max(100),
	timezone: timezoneSchema,
	settings: z.record(z.string(), z.unknown()),
	createdAt: z.string(),
	archivedAt: z.string().nullable(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const createWorkspaceInputSchema = z.object({
	slug: slugSchema,
	name: z.string().min(1).max(100),
	timezone: timezoneSchema,
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;

export const updateWorkspaceInputSchema = z
	.object({
		name: z.string().min(1).max(100),
		timezone: timezoneSchema,
		archived: z.boolean(),
	})
	.partial();
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;

export const workspaceMemberSchema = z.object({
	workspaceId: z.string(),
	userId: z.string(),
	role: workspaceRoleSchema,
	name: z.string(),
	email: z.string(),
	createdAt: z.string(),
});
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;

export const addWorkspaceMemberInputSchema = z.object({
	email: z.email(),
	role: workspaceRoleSchema.exclude(["owner"]).default("member"),
});
export type AddWorkspaceMemberInput = z.infer<
	typeof addWorkspaceMemberInputSchema
>;
export type AddWorkspaceMemberInputData = z.input<
	typeof addWorkspaceMemberInputSchema
>;

export type WorkspaceWithRole = Workspace & { role: WorkspaceRole };
