ALTER TABLE `agent_entries` RENAME TO `agent_spans`;--> statement-breakpoint
ALTER TABLE `agent_spans` RENAME COLUMN "entry_date" TO "span_date";--> statement-breakpoint
ALTER TABLE `work_entries` RENAME TO `work_spans`;--> statement-breakpoint
ALTER TABLE `work_spans` RENAME COLUMN "entry_date" TO "span_date";--> statement-breakpoint
DROP INDEX `work_entries_workspace_date_idx`;--> statement-breakpoint
DROP INDEX `work_entries_project_idx`;--> statement-breakpoint
DROP INDEX `work_entries_user_idx`;--> statement-breakpoint
CREATE INDEX `work_spans_workspace_date_idx` ON `work_spans` (`workspace_id`,`span_date`);--> statement-breakpoint
CREATE INDEX `work_spans_project_idx` ON `work_spans` (`project_id`);--> statement-breakpoint
CREATE INDEX `work_spans_user_idx` ON `work_spans` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_spans` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text,
	`agent_id` text NOT NULL,
	`session_id` text NOT NULL,
	`span_date` text NOT NULL,
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
INSERT INTO `__new_agent_spans`("id", "workspace_id", "owner_user_id", "project_id", "agent_id", "session_id", "span_date", "duration_minutes", "usage", "description", "started_at", "ended_at", "created_at", "updated_at") SELECT "id", "workspace_id", "owner_user_id", "project_id", "agent_id", "session_id", "span_date", "duration_minutes", "usage", "description", "started_at", "ended_at", "created_at", "updated_at" FROM `agent_spans`;--> statement-breakpoint
DROP TABLE `agent_spans`;--> statement-breakpoint
ALTER TABLE `__new_agent_spans` RENAME TO `agent_spans`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_spans_session_uq` ON `agent_spans` (`agent_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `agent_spans_workspace_idx` ON `agent_spans` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_spans_agent_idx` ON `agent_spans` (`agent_id`);