import type { Comment, ReactionEmoji, ReactionSummary } from "@toxil/core";
import { REACTION_EMOJIS } from "@toxil/core";
import type { ReportCommentRow, ReportReactionRow } from "@toxil/db";

/**
 * Aggregates raw reaction rows for one target into per-emoji summaries, ordered
 * by the canonical emoji order and dropping emoji with no reactions. `callerId`
 * drives the reactedByMe highlight.
 */
export function toReactionSummaries(
	rows: ReportReactionRow[],
	callerId: string,
): ReactionSummary[] {
	const byEmoji = new Map<ReactionEmoji, ReportReactionRow[]>();
	for (const row of rows) {
		// A row's emoji is unconstrained text in the DB; ignore anything not in
		// the current allowlist so a removed key never leaks to the client.
		if (!(REACTION_EMOJIS as readonly string[]).includes(row.emoji)) continue;
		const emoji = row.emoji as ReactionEmoji;
		const list = byEmoji.get(emoji);
		if (list) list.push(row);
		else byEmoji.set(emoji, [row]);
	}
	return REACTION_EMOJIS.flatMap((emoji) => {
		const list = byEmoji.get(emoji);
		if (!list || list.length === 0) return [];
		return [
			{
				emoji,
				count: list.length,
				reactedByMe: list.some((r) => r.userId === callerId),
				userNames: list.map((r) => r.userName),
			},
		];
	});
}

/** Maps a comment row + its reaction rows into the API comment shape. */
export function toApiComment(
	row: ReportCommentRow,
	reactionRows: ReportReactionRow[],
	callerId: string,
): Comment {
	return {
		id: row.id,
		reportId: row.reportId,
		authorUserId: row.authorUserId,
		authorName: row.authorName,
		body: row.body,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		editable: row.authorUserId === callerId,
		reactions: toReactionSummaries(reactionRows, callerId),
	};
}
