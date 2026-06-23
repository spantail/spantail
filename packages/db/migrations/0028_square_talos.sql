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
ALTER TABLE `reports` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
--> Backfill: every existing report becomes a version-1 content row. Its body has
--> no front-matter (legacy); that renders fine since display only strips a header
--> when present. The next migration drops reports.rendered_markdown.
INSERT INTO `report_content` (`id`, `report_id`, `version`, `content`, `note`, `created_at`)
SELECT `id` || '-v1', `id`, 1, `rendered_markdown`, `note`, `created_at` FROM `reports`;