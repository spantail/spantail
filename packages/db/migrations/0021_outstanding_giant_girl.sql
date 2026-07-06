CREATE TABLE `github_app_config` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` integer NOT NULL,
	`slug` text NOT NULL,
	`owner_login` text NOT NULL,
	`client_id` text NOT NULL,
	`private_key_enc` text NOT NULL,
	`webhook_secret_enc` text NOT NULL,
	`client_secret_enc` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `github_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`github_user_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`login` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_identities_github_user_uq` ON `github_identities` (`github_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `github_identities_user_uq` ON `github_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `github_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` integer NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`suspended_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_installations_installation_uq` ON `github_installations` (`installation_id`);--> statement-breakpoint
CREATE TABLE `github_repo_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_full_name` text NOT NULL,
	`repo_id` integer,
	`project_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`source` text NOT NULL,
	`installation_id` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_repo_mappings_full_name_uq` ON `github_repo_mappings` (`repo_full_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `github_repo_mappings_repo_id_uq` ON `github_repo_mappings` (`repo_id`);--> statement-breakpoint
CREATE INDEX `github_repo_mappings_project_idx` ON `github_repo_mappings` (`project_id`);--> statement-breakpoint
CREATE INDEX `github_repo_mappings_workspace_idx` ON `github_repo_mappings` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `work_entry_github_refs` (
	`work_entry_id` text PRIMARY KEY NOT NULL,
	`repo_full_name` text NOT NULL,
	`issue_number` integer NOT NULL,
	`comment_id` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`work_entry_id`) REFERENCES `work_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_entry_github_refs_comment_uq` ON `work_entry_github_refs` (`comment_id`);--> statement-breakpoint
CREATE INDEX `work_entry_github_refs_issue_idx` ON `work_entry_github_refs` (`repo_full_name`,`issue_number`);