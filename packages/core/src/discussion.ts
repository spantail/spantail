import { z } from "zod";

/**
 * GitHub-style reaction set, stored as stable content keys (not glyphs) so the
 * client owns the glyph + aria-label mapping and the wire stays i18n-friendly.
 */
export const reactionEmojiSchema = z.enum([
	"+1",
	"-1",
	"laugh",
	"hooray",
	"confused",
	"heart",
	"rocket",
	"eyes",
]);
export type ReactionEmoji = z.infer<typeof reactionEmojiSchema>;

/** All reaction emoji in display order. */
export const REACTION_EMOJIS = reactionEmojiSchema.options;

/** Reactions for one target, aggregated by emoji so the client stays dumb. */
export const reactionSummarySchema = z.object({
	emoji: reactionEmojiSchema,
	count: z.number().int().nonnegative(),
	// Whether the caller is among the reactors (drives the toggle highlight).
	reactedByMe: z.boolean(),
	// Display names of reactors, for the hover tooltip.
	userNames: z.array(z.string()),
});
export type ReactionSummary = z.infer<typeof reactionSummarySchema>;

/** A Markdown comment with its own aggregated reactions. */
export const commentSchema = z.object({
	id: z.string(),
	reportId: z.string(),
	// Null once the author's account is deleted; the frozen name stands alone.
	authorUserId: z.string().nullable(),
	authorName: z.string(),
	body: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	// True when the caller authored it (drives the edit/delete menu).
	editable: z.boolean(),
	reactions: z.array(reactionSummarySchema),
});
export type Comment = z.infer<typeof commentSchema>;

/**
 * A report's discussion. `shared` is false for a report that has never been
 * sent (its owner is the only participant) — the UI hides the panel then.
 */
export const reportDiscussionSchema = z.object({
	shared: z.boolean(),
	// Report-body reactions.
	reactions: z.array(reactionSummarySchema),
	comments: z.array(commentSchema),
});
export type ReportDiscussion = z.infer<typeof reportDiscussionSchema>;

export const createCommentInputSchema = z.object({
	body: z.string().min(1).max(10000),
});
export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;

export const updateCommentInputSchema = createCommentInputSchema;
export type UpdateCommentInput = z.infer<typeof updateCommentInputSchema>;

export const toggleReactionInputSchema = z.object({
	emoji: reactionEmojiSchema,
});
export type ToggleReactionInput = z.infer<typeof toggleReactionInputSchema>;
