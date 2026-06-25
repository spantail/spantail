import { z } from "zod";

import { slugSchema, timezoneSchema } from "./common";

export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

// Accent color theme, scoped to a workspace and shared by all its members.
// "neutral" (achromatic) is the default; the rest are well-separated hues for
// at-a-glance workspace identification. Drives the [data-accent] CSS theme.
export const workspaceAccentColorSchema = z.enum([
	"neutral",
	"red",
	"orange",
	"amber",
	"green",
	"teal",
	"blue",
	"violet",
	"pink",
]);
export type WorkspaceAccentColor = z.infer<typeof workspaceAccentColorSchema>;

export const workspaceSchema = z.object({
	id: z.string(),
	slug: slugSchema,
	name: z.string().min(1).max(100),
	timezone: timezoneSchema,
	accentColor: workspaceAccentColorSchema,
	logoUrl: z.string().nullable(),
	settings: z.record(z.string(), z.unknown()),
	createdAt: z.string(),
	archivedAt: z.string().nullable(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

// Workspace logo upload constraints, shared by the API boundary, the SDK, the
// upload UI, and tests. The logo is stored in R2 and served through the Worker;
// SVG is intentionally excluded to avoid same-origin stored-XSS via the served
// image URL.
export const WORKSPACE_LOGO_MAX_BYTES = 1024 * 1024; // 1 MB
export const WORKSPACE_LOGO_MIME_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
] as const;
export type WorkspaceLogoMimeType = (typeof WORKSPACE_LOGO_MIME_TYPES)[number];

export function isWorkspaceLogoMimeType(
	value: string,
): value is WorkspaceLogoMimeType {
	return (WORKSPACE_LOGO_MIME_TYPES as readonly string[]).includes(value);
}

export const createWorkspaceInputSchema = z.object({
	slug: slugSchema,
	name: z.string().min(1).max(100),
	timezone: timezoneSchema,
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;

export const updateWorkspaceInputSchema = z
	.object({
		slug: slugSchema,
		name: z.string().min(1).max(100),
		timezone: timezoneSchema,
		accentColor: workspaceAccentColorSchema,
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
	// Ready-to-use avatar URL, or null when the member has no avatar.
	imageUrl: z.string().nullable(),
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

// `role` is the caller's role in the workspace, or `null` when an instance
// admin is shown a workspace they are not a member of (the admin bypass — see
// docs/permissions.md). Plain members always carry a concrete role.
export type WorkspaceWithRole = Workspace & { role: WorkspaceRole | null };
