import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAtMs } from "./domain";

const updatedAtMs = () =>
	integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull();

// Instance-wide settings live in a single row (id = "singleton"). One Toxil
// deployment serves one company, so there is exactly one instance to configure.
export const instanceSettings = sqliteTable("instance_settings", {
	id: text("id").primaryKey(),
	// Email delivery is off by default: Cloudflare Email Service needs a Workers
	// Paid plan, so only an instance admin opts in. While off, invitation emails
	// are disabled and admins hand out auto-generated passwords out of band.
	emailEnabled: integer("email_enabled", { mode: "boolean" })
		.notNull()
		.default(false),
	emailFromAddress: text("email_from_address"),
	emailFromName: text("email_from_name"),
	// Social login is off by default; an instance admin opts in once the matching
	// OAuth client credentials are configured in the environment.
	googleOAuthEnabled: integer("google_oauth_enabled", { mode: "boolean" })
		.notNull()
		.default(false),
	githubOAuthEnabled: integer("github_oauth_enabled", { mode: "boolean" })
		.notNull()
		.default(false),
	// Allowlist of email domains permitted to sign in with Google. Empty array
	// (the default) means no restriction.
	googleAllowedDomains: text("google_allowed_domains", { mode: "json" })
		.$type<string[]>()
		.notNull()
		.default([]),
	updatedAt: updatedAtMs(),
});

export const userInvitations = sqliteTable(
	"user_invitations",
	{
		id: text("id").primaryKey(),
		email: text("email").notNull(),
		// SHA-256 hex digest; the raw token only ever lives in the emailed link.
		tokenHash: text("token_hash").notNull().unique(),
		invitedByUserId: text("invited_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Whether accepting this invitation also grants instance-admin rights.
		grantAdmin: integer("grant_admin", { mode: "boolean" })
			.notNull()
			.default(false),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
		createdAt: createdAtMs(),
	},
	(table) => [index("user_invitations_email_idx").on(table.email)],
);
