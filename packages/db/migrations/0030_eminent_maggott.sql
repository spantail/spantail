CREATE TABLE `agent_projects` (
	`agent_id` text NOT NULL,
	`project_id` text NOT NULL,
	PRIMARY KEY(`agent_id`, `project_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT OR IGNORE INTO `agent_projects` (`agent_id`, `project_id`) SELECT `agent_id`, `default_project_id` FROM `agent_tokens` WHERE `default_project_id` IS NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`default_workspace_id` text,
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent_tokens`("id", "agent_id", "name", "token_hash", "default_workspace_id", "last_used_at", "expires_at", "created_at") SELECT "id", "agent_id", "name", "token_hash", "default_workspace_id", "last_used_at", "expires_at", "created_at" FROM `agent_tokens`;--> statement-breakpoint
DROP TABLE `agent_tokens`;--> statement-breakpoint
ALTER TABLE `__new_agent_tokens` RENAME TO `agent_tokens`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tokens_token_hash_unique` ON `agent_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `agent_tokens_agent_idx` ON `agent_tokens` (`agent_id`);