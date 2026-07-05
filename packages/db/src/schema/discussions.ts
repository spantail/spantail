import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAtMs } from "./domain";
import { reportContent } from "./reports";

const updatedAtMs = () =>
	integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull();

// A Markdown comment on a report discussion. The thread is keyed by the content
// version that was sent, so the owner (sender) and the recipients of *that
// version* share one conversation — a later version starts a fresh thread.
// Authorship is dropped if the author's account is deleted; the frozen
// authorName/authorEmail keep the comment readable (mirrors report_deliveries).
export const reportComments = sqliteTable(
	"report_comments",
	{
		id: text("id").primaryKey(),
		reportContentId: text("report_content_id")
			.notNull()
			.references(() => reportContent.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		authorName: text("author_name").notNull(),
		authorEmail: text("author_email").notNull(),
		body: text("body").notNull(),
		createdAt: createdAtMs(),
		updatedAt: updatedAtMs(),
	},
	(table) => [
		index("report_comments_content_idx").on(
			table.reportContentId,
			table.createdAt,
		),
	],
);

// An emoji reaction on a sent version's body (commentId null) or on a single
// comment (commentId set). A deleted user's reactions are meaningless, so they
// cascade.
export const reportReactions = sqliteTable(
	"report_reactions",
	{
		id: text("id").primaryKey(),
		reportContentId: text("report_content_id")
			.notNull()
			.references(() => reportContent.id, { onDelete: "cascade" }),
		// Null = reaction on the version's body; set = reaction on that comment.
		commentId: text("comment_id").references(() => reportComments.id, {
			onDelete: "cascade",
		}),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Frozen for the hover tooltip listing who reacted.
		userName: text("user_name").notNull(),
		// A GitHub-style content key (see @spantail/core reactionEmojiSchema).
		emoji: text("emoji").notNull(),
		createdAt: createdAtMs(),
	},
	(table) => [
		// Every discussion fetch lists a version's reactions by report_content_id;
		// neither unique index below covers that predicate (one is partial, the
		// other leads with comment_id), so a plain index keeps the lookup off a
		// scan.
		index("report_reactions_content_idx").on(table.reportContentId),
		// One emoji per user per target. SQLite treats NULLs as distinct, so a
		// single unique index over the nullable comment_id wouldn't dedupe
		// body reactions — split into two partial indexes.
		uniqueIndex("report_reactions_content_uq")
			.on(table.reportContentId, table.userId, table.emoji)
			.where(sql`comment_id is null`),
		uniqueIndex("report_reactions_comment_uq")
			.on(table.commentId, table.userId, table.emoji)
			.where(sql`comment_id is not null`),
	],
);
