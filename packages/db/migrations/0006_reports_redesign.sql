/*
 Reports redesign — collapse to a 2-layer model (Template -> Report).

 This is an intentionally DESTRUCTIVE clean reset (pre-release): report
 snapshots, reports, custom templates, and shares are dropped and recreated
 with the new shape. A Report now stores its own rendered_markdown and an
 absolute period; report_snapshots is gone; report_shares point at reports and
 carry the R2 object key plus frozen title/period for the public view.

 Child tables are dropped before their parents to satisfy foreign keys.
*/
DROP TABLE IF EXISTS `report_shares`;--> statement-breakpoint
DROP TABLE IF EXISTS `report_snapshots`;--> statement-breakpoint
DROP TABLE IF EXISTS `reports`;--> statement-breakpoint
DROP TABLE IF EXISTS `report_templates`;--> statement-breakpoint
CREATE TABLE `report_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`body` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`period_unit` text DEFAULT 'custom' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `report_templates_workspace_idx` ON `report_templates` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`template_id` text NOT NULL,
	`filters` text NOT NULL,
	`note` text,
	`rendered_markdown` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reports_owner_idx` ON `reports` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `report_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`token` text NOT NULL,
	`r2_key` text NOT NULL,
	`report_name` text NOT NULL,
	`date_from` text NOT NULL,
	`date_to` text NOT NULL,
	`passcode_hash` text,
	`expires_at` integer,
	`revoked_at` integer,
	`view_count` integer DEFAULT 0 NOT NULL,
	`last_viewed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_shares_token_unique` ON `report_shares` (`token`);--> statement-breakpoint
CREATE INDEX `report_shares_report_idx` ON `report_shares` (`report_id`);
