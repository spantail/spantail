PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_work_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text,
	`user_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`description` text NOT NULL,
	`note` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_work_entries`("id", "workspace_id", "project_id", "user_id", "entry_date", "duration_minutes", "started_at", "ended_at", "description", "note", "tags", "source", "created_at", "updated_at") SELECT "id", "workspace_id", "project_id", "user_id", "entry_date", "duration_minutes", "started_at", "ended_at", "description", "note", "tags", "source", "created_at", "updated_at" FROM `work_entries`;--> statement-breakpoint
DROP TABLE `work_entries`;--> statement-breakpoint
ALTER TABLE `__new_work_entries` RENAME TO `work_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `work_entries_workspace_date_idx` ON `work_entries` (`workspace_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `work_entries_project_idx` ON `work_entries` (`project_id`);--> statement-breakpoint
CREATE INDEX `work_entries_user_idx` ON `work_entries` (`user_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `hue` integer;