import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAtMs } from "./domain";

// A viewer's organizational flags (starred / archived / trashed) on a mailbox
// item. A report_deliveries row is per (sender, recipient) pair, so the same
// physical rows carry two independent viewpoints: the recipient flags their
// received copy (per row), the sender flags their sent batch (per batch). One
// starredAt column on the delivery row can't hold both, so flags live here,
// keyed by (userId, scope, targetId), and report_deliveries stays a frozen
// snapshot. Trash is a per-viewer soft delete — a recipient trashing their copy
// never affects the sender's Sent view (the email model).
export const deliveryFlags = sqliteTable(
	"delivery_flags",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// "received" → targetId is a report_deliveries.id; "sent" → a batch_id.
		scope: text("scope", { enum: ["received", "sent"] }).notNull(),
		// Not a FK: for "sent" it references a logical batch, not a table PK.
		// Orphan rows (source delivery deleted) never surface — folder queries join
		// from deliveries/batches outward, so a dangling flag is simply unreachable.
		targetId: text("target_id").notNull(),
		starredAt: integer("starred_at", { mode: "timestamp_ms" }),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		trashedAt: integer("trashed_at", { mode: "timestamp_ms" }),
		createdAt: createdAtMs(),
	},
	(table) => [
		// One flag row per viewer per target; lets the toggle endpoint upsert.
		uniqueIndex("delivery_flags_user_target_uq").on(
			table.userId,
			table.scope,
			table.targetId,
		),
		// Folder filters always pin userId + scope.
		index("delivery_flags_user_scope_idx").on(table.userId, table.scope),
	],
);
