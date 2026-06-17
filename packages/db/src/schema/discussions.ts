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
import { reports } from "./reports";

const updatedAtMs = () =>
	integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull();

// A Markdown comment on a report's discussion. The thread is keyed by the report
// so the owner (sender) and every Send-to recipient share one conversation.
// Authorship is dropped if the author's account is deleted; the frozen
// authorName/authorEmail keep the comment readable (mirrors report_deliveries).
export const reportComments = sqliteTable(
	"report_comments",
	{
		id: text("id").primaryKey(),
		reportId: text("report_id")
			.notNull()
			.references(() => reports.id, { onDelete: "cascade" }),
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
		index("report_comments_report_idx").on(table.reportId, table.createdAt),
	],
);

// An emoji reaction on a report body (commentId null) or on a single comment
// (commentId set). A deleted user's reactions are meaningless, so they cascade.
export const reportReactions = sqliteTable(
	"report_reactions",
	{
		id: text("id").primaryKey(),
		reportId: text("report_id")
			.notNull()
			.references(() => reports.id, { onDelete: "cascade" }),
		// Null = reaction on the report body; set = reaction on that comment.
		commentId: text("comment_id").references(() => reportComments.id, {
			onDelete: "cascade",
		}),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Frozen for the hover tooltip listing who reacted.
		userName: text("user_name").notNull(),
		// A GitHub-style content key (see @toxil/core reactionEmojiSchema).
		emoji: text("emoji").notNull(),
		createdAt: createdAtMs(),
	},
	(table) => [
		// One emoji per user per target. SQLite treats NULLs as distinct, so a
		// single unique index over the nullable comment_id wouldn't dedupe
		// report-body reactions — split into two partial indexes.
		uniqueIndex("report_reactions_report_uq")
			.on(table.reportId, table.userId, table.emoji)
			.where(sql`comment_id is null`),
		uniqueIndex("report_reactions_comment_uq")
			.on(table.commentId, table.userId, table.emoji)
			.where(sql`comment_id is not null`),
	],
);
