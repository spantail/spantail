DROP TABLE `agent_projects`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent_tokens`("id", "agent_id", "name", "token_hash", "last_used_at", "expires_at", "created_at") SELECT "id", "agent_id", "name", "token_hash", "last_used_at", "expires_at", "created_at" FROM `agent_tokens`;--> statement-breakpoint
DROP TABLE `agent_tokens`;--> statement-breakpoint
ALTER TABLE `__new_agent_tokens` RENAME TO `agent_tokens`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tokens_token_hash_unique` ON `agent_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `agent_tokens_agent_idx` ON `agent_tokens` (`agent_id`);