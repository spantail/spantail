import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAtMs } from "./domain";
import { reportContent, reports } from "./reports";

// An internal "Send to" delivery: a snapshot of a report dropped into another
// user's inbox. The body and identifying metadata are frozen at send time, so a
// later report edit — or the sender's deletion — never changes what the
// recipient received (the email model). Deleting the source report, however,
// cascades and removes the deliveries it produced.
export const reportDeliveries = sqliteTable(
	"report_deliveries",
	{
		id: text("id").primaryKey(),
		// Deleting the source report cascades to its deliveries: removing a report
		// clears the copies it dropped into recipients' inboxes.
		reportId: text("report_id").references(() => reports.id, {
			onDelete: "cascade",
		}),
		// The exact content version that was sent, so recipient actions (e.g.
		// re-sharing from the inbox) can reference it instead of re-deriving it
		// from the frozen body. Nullable only for rollout ordering: code always
		// sets it and the migration backfills existing rows.
		reportContentId: text("report_content_id").references(
			() => reportContent.id,
			{ onDelete: "cascade" },
		),
		// Authorship is dropped if the sender's account is deleted; the frozen
		// senderName/senderEmail keep the message readable.
		senderUserId: text("sender_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		recipientUserId: text("recipient_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Shared by every row from one "Send to" (one send fans out to N rows); the
		// sender's Sent folder groups by it. Nullable for an order-safe rollout:
		// after the column is added but before the new Worker ships, an old send
		// inserts no batch_id. Queries treat a NULL as a singleton batch via
		// COALESCE(batch_id, id), so grouping/flagging never see a null key.
		batchId: text("batch_id"),
		// Sender identity and report title/period frozen at send time.
		senderName: text("sender_name").notNull(),
		senderEmail: text("sender_email").notNull(),
		reportName: text("report_name").notNull(),
		dateFrom: text("date_from").notNull(),
		dateTo: text("date_to").notNull(),
		// The rendered document frozen at send time.
		renderedMarkdown: text("rendered_markdown").notNull(),
		// Optional short note from the sender.
		message: text("message"),
		// Null until the recipient opens it.
		readAt: integer("read_at", { mode: "timestamp_ms" }),
		createdAt: createdAtMs(),
	},
	(table) => [
		index("report_deliveries_recipient_idx").on(
			table.recipientUserId,
			table.createdAt,
		),
		// Drives the Sent folder: the sender's batches, newest first.
		index("report_deliveries_sender_batch_idx").on(
			table.senderUserId,
			table.batchId,
			table.createdAt,
		),
	],
);
