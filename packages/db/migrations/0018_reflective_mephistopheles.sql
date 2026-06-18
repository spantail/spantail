PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_report_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`body` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`period_unit` text DEFAULT 'custom' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_report_templates`("id", "name", "description", "body", "enabled", "period_unit", "created_by", "created_at", "updated_at") SELECT "id", "name", "description", "body", "enabled", "period_unit", "created_by", "created_at", "updated_at" FROM `report_templates`;--> statement-breakpoint
DROP TABLE `report_templates`;--> statement-breakpoint
ALTER TABLE `__new_report_templates` RENAME TO `report_templates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `user` ADD `can_manage_templates` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `instance_settings` ADD `report_template_overrides` text DEFAULT '{}' NOT NULL;