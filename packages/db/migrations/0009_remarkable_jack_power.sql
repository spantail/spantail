PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_report_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`body` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`period_unit` text DEFAULT 'custom' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_report_templates`("id", "workspace_id", "name", "description", "body", "enabled", "period_unit", "created_by", "created_at", "updated_at") SELECT "id", "workspace_id", "name", "description", "body", "enabled", "period_unit", "created_by", "created_at", "updated_at" FROM `report_templates`;--> statement-breakpoint
DROP TABLE `report_templates`;--> statement-breakpoint
ALTER TABLE `__new_report_templates` RENAME TO `report_templates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `report_templates_workspace_idx` ON `report_templates` (`workspace_id`);