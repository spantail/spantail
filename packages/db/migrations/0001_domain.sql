CREATE TABLE `project_members` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_members_user_idx` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`hue` integer DEFAULT 264 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_workspace_slug_uq` ON `projects` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `work_entries` (
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
CREATE INDEX `work_entries_workspace_date_idx` ON `work_entries` (`workspace_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `work_entries_project_idx` ON `work_entries` (`project_id`);--> statement-breakpoint
CREATE INDEX `work_entries_user_idx` ON `work_entries` (`user_id`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_members_user_idx` ON `workspace_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`timezone` text NOT NULL,
	`accent_color` text DEFAULT 'neutral' NOT NULL,
	`logo_url` text,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);