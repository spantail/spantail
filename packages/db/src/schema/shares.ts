import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { createdAtMs } from "./domain";
import { reportSnapshots } from "./reports";

export const reportShares = sqliteTable(
	"report_shares",
	{
		id: text("id").primaryKey(),
		snapshotId: text("snapshot_id")
			.notNull()
			.references(() => reportSnapshots.id, { onDelete: "cascade" }),
		// Stored in plaintext deliberately: a database leak already exposes the
		// snapshot's rendered_markdown, and plaintext lets the UI re-copy the
		// share URL. Passcodes, being user-chosen secrets, are hashed (KDF).
		token: text("token").notNull().unique(),
		passcodeHash: text("passcode_hash"),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
		viewCount: integer("view_count").notNull().default(0),
		lastViewedAt: integer("last_viewed_at", { mode: "timestamp_ms" }),
		createdAt: createdAtMs(),
	},
	(table) => [index("report_shares_snapshot_idx").on(table.snapshotId)],
);
