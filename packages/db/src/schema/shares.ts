import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { createdAtMs } from "./domain";
import { reports } from "./reports";

export const reportShares = sqliteTable(
	"report_shares",
	{
		id: text("id").primaryKey(),
		reportId: text("report_id")
			.notNull()
			.references(() => reports.id, { onDelete: "cascade" }),
		// Stored in plaintext deliberately: it is a capability the owner re-copies.
		// Passcodes, being user-chosen secrets, are hashed (KDF).
		token: text("token").notNull().unique(),
		// The Markdown frozen at mint time, so a later report edit never changes a
		// published page. Title/period below are frozen alongside it.
		renderedMarkdown: text("rendered_markdown").notNull(),
		reportName: text("report_name").notNull(),
		dateFrom: text("date_from").notNull(),
		dateTo: text("date_to").notNull(),
		passcodeHash: text("passcode_hash"),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
		viewCount: integer("view_count").notNull().default(0),
		lastViewedAt: integer("last_viewed_at", { mode: "timestamp_ms" }),
		createdAt: createdAtMs(),
	},
	(table) => [index("report_shares_report_idx").on(table.reportId)],
);
