ALTER TABLE `reports` RENAME COLUMN `scope` TO `filters`;--> statement-breakpoint
ALTER TABLE `report_snapshots` RENAME COLUMN `resolved_scope` TO `resolved_filters`;
