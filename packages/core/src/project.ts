import { z } from "zod";

import { slugSchema } from "./common";

export const projectStatusSchema = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/** A project's color marker, stored as an OKLCH hue (0–359). Always set: the
 * create form picks one and the column defaults when omitted. */
export const projectHueSchema = z.number().int().min(0).max(359);

/** Marker symbols paired with the hue so a project is identifiable by shape as
 * well as colour (colour is never the sole cue — WCAG 1.4.1). Filled geometric
 * glyphs; the order is the picker order. */
export const PROJECT_SYMBOLS = [
	"circle",
	"square",
	"triangle",
	"diamond",
	"star",
	"heart",
	"spade",
	"club",
	"ring",
] as const;
export const projectSymbolSchema = z.enum(PROJECT_SYMBOLS);
export type ProjectSymbol = z.infer<typeof projectSymbolSchema>;
/** Fallback for migrated/omitted rows. */
export const DEFAULT_PROJECT_SYMBOL: ProjectSymbol = "circle";

/** Picks a marker symbol that spreads variety: the least-used symbol among the
 * given already-used ones (ties broken by picker order). Used to seed the
 * create-project form so new projects don't all default to the same shape. */
export function pickNextSymbol(usedSymbols: readonly string[]): ProjectSymbol {
	const counts = new Map<ProjectSymbol, number>(
		PROJECT_SYMBOLS.map((s) => [s, 0]),
	);
	for (const s of usedSymbols) {
		if (counts.has(s as ProjectSymbol)) {
			counts.set(s as ProjectSymbol, (counts.get(s as ProjectSymbol) ?? 0) + 1);
		}
	}
	let best: ProjectSymbol = PROJECT_SYMBOLS[0];
	let bestCount = Number.POSITIVE_INFINITY;
	for (const symbol of PROJECT_SYMBOLS) {
		const count = counts.get(symbol) ?? 0;
		if (count < bestCount) {
			best = symbol;
			bestCount = count;
		}
	}
	return best;
}

export const projectSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	slug: slugSchema,
	name: z.string().min(1).max(100),
	description: z.string().max(1000).nullable(),
	hue: projectHueSchema,
	symbol: projectSymbolSchema,
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
	symbol: projectSymbolSchema.optional(),
	// Initial project members (workspace member ids), added with the project.
	memberUserIds: z.array(z.string()).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type CreateProjectInputData = z.input<typeof createProjectInputSchema>;

/** A project member, joined with the user's profile for display. */
export const projectMemberSchema = z.object({
	projectId: z.string(),
	userId: z.string(),
	name: z.string(),
	email: z.string(),
	// Ready-to-use avatar URL, or null when the member has no avatar.
	imageUrl: z.string().nullable(),
	createdAt: z.string(),
});
export type ProjectMember = z.infer<typeof projectMemberSchema>;

export const addProjectMemberInputSchema = z.object({
	userId: z.string(),
});
export type AddProjectMemberInput = z.infer<typeof addProjectMemberInputSchema>;

/** A project member's avatar info, for the projects table's avatar stacks. */
export const projectMemberAvatarSchema = z.object({
	projectId: z.string(),
	userId: z.string(),
	name: z.string(),
	imageUrl: z.string().nullable(),
});
export type ProjectMemberAvatar = z.infer<typeof projectMemberAvatarSchema>;

export const updateProjectInputSchema = z
	.object({
		name: z.string().min(1).max(100),
		slug: slugSchema,
		description: z.string().max(1000).nullable(),
		hue: projectHueSchema,
		symbol: projectSymbolSchema,
		status: projectStatusSchema,
	})
	.partial();
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
