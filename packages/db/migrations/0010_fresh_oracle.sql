ALTER TABLE `report_templates` ADD `is_default` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `report_templates` ADD `name_template` text;--> statement-breakpoint
ALTER TABLE `report_templates` ADD `note_template` text;--> statement-breakpoint
-- Backfill: an instance that already has templates needs exactly one default.
-- Pick the earliest (the lazily-seeded "default" is normally the oldest row).
-- Empty instances are handled by the lazy seed, which inserts is_default = 1.
UPDATE `report_templates` SET `is_default` = 1 WHERE `id` = (SELECT `id` FROM `report_templates` ORDER BY `created_at` ASC, `id` ASC LIMIT 1);