CREATE TABLE `agent_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text,
	`agent_id` text NOT NULL,
	`session_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`usage` text,
	`description` text,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_entries_session_uq` ON `agent_entries` (`agent_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `agent_entries_workspace_idx` ON `agent_entries` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_entries_agent_idx` ON `agent_entries` (`agent_id`);--> statement-breakpoint
CREATE TABLE `agent_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`default_workspace_id` text,
	`default_project_id` text,
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tokens_token_hash_unique` ON `agent_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `agent_tokens_agent_idx` ON `agent_tokens` (`agent_id`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agents_user_idx` ON `agents` (`user_id`);--> statement-breakpoint
ALTER TABLE `instance_settings` ADD `agents_enabled` integer DEFAULT false NOT NULL;