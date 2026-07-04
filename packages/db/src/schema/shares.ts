import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAtMs } from "./domain";
import { reportContent } from "./reports";

// A public capability link over one immutable report_content version. The row
// holds no copy of the document: the referenced version can never change or be
// individually deleted, so a published page stays frozen by construction, and
// it disappears only when the whole report (and with it every version) goes.
export const reportShares = sqliteTable(
	"report_shares",
	{
		id: text("id").primaryKey(),
		reportContentId: text("report_content_id")
			.notNull()
			.references(() => reportContent.id, { onDelete: "cascade" }),
		// Who minted the link — the report owner (report screen) or a delivery
		// recipient (Messages). Ownership checks compare against this directly;
		// listings scope by (content, creator) so the two never see each other's
		// links.
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Stored in plaintext deliberately: it is a capability the creator
		// re-copies. Passcodes, being user-chosen secrets, are hashed (KDF).
		token: text("token").notNull().unique(),
		passcodeHash: text("passcode_hash"),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
		viewCount: integer("view_count").notNull().default(0),
		lastViewedAt: integer("last_viewed_at", { mode: "timestamp_ms" }),
		createdAt: createdAtMs(),
	},
	(table) => [index("report_shares_content_idx").on(table.reportContentId)],
);
