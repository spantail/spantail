CREATE TABLE `report_content` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_content_report_version_idx` ON `report_content` (`report_id`,`version`);--> statement-breakpoint
CREATE INDEX `report_content_report_idx` ON `report_content` (`report_id`);--> statement-breakpoint
CREATE TABLE `report_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`body` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`template_id` text NOT NULL,
	`filters` text NOT NULL,
	`note` text,
	`total_minutes` integer,
	`snapshot_project_ids` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reports_owner_idx` ON `reports` (`owner_user_id`);