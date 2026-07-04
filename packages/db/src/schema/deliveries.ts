import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAtMs } from "./domain";
import { reportContent } from "./reports";

// An internal "Send to" delivery: a message dropping one immutable report
// version into another user's inbox. The version reference is what freezes the
// message — a later report edit appends a new version and never changes what
// the recipient received (the email model). Deleting the source report still
// removes its deliveries, via the reports → report_content → here cascade
// chain; that chain is equivalent to a direct report FK only because content
// versions are never deleted individually (see the report_content invariant).
export const reportDeliveries = sqliteTable(
	"report_deliveries",
	{
		id: text("id").primaryKey(),
		// The exact content version that was sent — the sole reference to the
		// report. The delivered body, name, and period are read from this version
		// (its front matter) at display time.
		reportContentId: text("report_content_id")
			.notNull()
			.references(() => reportContent.id, { onDelete: "cascade" }),
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
		// Sender identity frozen at send time (it has no immutable home to
		// reference, unlike the report data).
		senderName: text("sender_name").notNull(),
		senderEmail: text("sender_email").notNull(),
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
		index("report_deliveries_content_idx").on(table.reportContentId),
	],
);
