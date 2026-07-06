import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAtMs, projects, workEntries, workspaces } from "./domain";

const updatedAtMs = () =>
	integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull();

/**
 * The instance's bring-your-own GitHub App, one row (id = "singleton").
 * Credentials arrive at runtime via the App Manifest conversion, so they are
 * stored here rather than as environment secrets — AES-GCM encrypted with a
 * key derived from BETTER_AUTH_SECRET (see docs/security.md). The private key
 * is converted to PKCS#8 DER at write time (WebCrypto cannot import the
 * PKCS#1 PEM GitHub returns). The row's existence is the "enabled" flag.
 */
export const githubAppConfig = sqliteTable("github_app_config", {
	id: text("id").primaryKey(),
	appId: integer("app_id").notNull(),
	slug: text("slug").notNull(),
	ownerLogin: text("owner_login").notNull(),
	// The OAuth client id is public by design; only the secrets are encrypted.
	clientId: text("client_id").notNull(),
	privateKeyEnc: text("private_key_enc").notNull(),
	webhookSecretEnc: text("webhook_secret_enc").notNull(),
	clientSecretEnc: text("client_secret_enc").notNull(),
	createdAt: createdAtMs(),
	updatedAt: updatedAtMs(),
});

/**
 * App installations, maintained solely by installation webhooks. Installed
 * repos are NOT mirrored here — the settings UI lists them live via the
 * GitHub API, and binding a repo to a project is a human act that writes a
 * mapping row.
 */
export const githubInstallations = sqliteTable(
	"github_installations",
	{
		id: text("id").primaryKey(),
		installationId: integer("installation_id").notNull(),
		accountLogin: text("account_login").notNull(),
		accountType: text("account_type", {
			enum: ["User", "Organization"],
		}).notNull(),
		suspendedAt: integer("suspended_at", { mode: "timestamp_ms" }),
		createdAt: createdAtMs(),
	},
	(table) => [
		uniqueIndex("github_installations_installation_uq").on(
			table.installationId,
		),
	],
);

/**
 * repo → project mapping: the server-side single source of truth (issue
 * #159; the plugin holds no project id). Keyed by the lowercased full name —
 * manual registration and the plugin only know `owner/repo` — while the
 * numeric repo id (present when the mapping came via an installation)
 * self-heals the cached full name across renames. One repo maps to one
 * project instance-wide; a mapping survives App/installation removal, which
 * is exactly degraded mode.
 */
export const githubRepoMappings = sqliteTable(
	"github_repo_mappings",
	{
		id: text("id").primaryKey(),
		// Canonical form: lowercase "owner/repo".
		repoFullName: text("repo_full_name").notNull(),
		repoId: integer("repo_id"),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		// Denormalized from the project so webhook lookups resolve the workspace
		// in one read.
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		source: text("source", { enum: ["installation", "manual"] }).notNull(),
		// GitHub's installation number, no FK: mappings outlive installations.
		installationId: integer("installation_id"),
		createdAt: createdAtMs(),
	},
	(table) => [
		uniqueIndex("github_repo_mappings_full_name_uq").on(table.repoFullName),
		// SQLite unique indexes admit multiple NULLs, so manual mappings coexist.
		uniqueIndex("github_repo_mappings_repo_id_uq").on(table.repoId),
		index("github_repo_mappings_project_idx").on(table.projectId),
		index("github_repo_mappings_workspace_idx").on(table.workspaceId),
	],
);

/**
 * GitHub account ↔ Spantail user link, instance-wide and 1:1 both ways.
 * Keyed by the immutable numeric GitHub user id — never the mutable login,
 * which is only a display cache. Established via the App's user-authorization
 * OAuth flow, so ownership of the GitHub account is verified.
 */
export const githubIdentities = sqliteTable(
	"github_identities",
	{
		id: text("id").primaryKey(),
		githubUserId: integer("github_user_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		login: text("login").notNull(),
		createdAt: createdAtMs(),
	},
	(table) => [
		uniqueIndex("github_identities_github_user_uq").on(table.githubUserId),
		uniqueIndex("github_identities_user_uq").on(table.userId),
	],
);

/**
 * (repo, issue#) provenance of a work entry logged from GitHub. One ref per
 * entry; many entries per issue back the "total on this issue" running sum.
 * The unique comment id makes webhook redelivery idempotent (null for
 * plugin-logged entries, which have no triggering comment). The full name is
 * denormalized — not an FK to the mapping — so totals survive mapping edits.
 */
export const workEntryGithubRefs = sqliteTable(
	"work_entry_github_refs",
	{
		workEntryId: text("work_entry_id")
			.primaryKey()
			.references(() => workEntries.id, { onDelete: "cascade" }),
		repoFullName: text("repo_full_name").notNull(),
		issueNumber: integer("issue_number").notNull(),
		commentId: integer("comment_id"),
		createdAt: createdAtMs(),
	},
	(table) => [
		uniqueIndex("work_entry_github_refs_comment_uq").on(table.commentId),
		index("work_entry_github_refs_issue_idx").on(
			table.repoFullName,
			table.issueNumber,
		),
	],
);
