import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const apiTokens = sqliteTable(
	"api_tokens",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		// SHA-256 hex digest; the plaintext token is shown once and never stored.
		tokenHash: text("token_hash").notNull().unique(),
		scopes: text("scopes", { mode: "json" })
			.$type<Array<"read" | "write" | "admin">>()
			.notNull(),
		lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("api_tokens_user_idx").on(table.userId)],
);
