ALTER TABLE `report_templates` ADD `is_default` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `report_templates` ADD `name_template` text;--> statement-breakpoint
ALTER TABLE `report_templates` ADD `note_template` text;--> statement-breakpoint
-- Backfill: an instance that already has templates needs exactly one default.
-- Prefer the earliest enabled template (the lazily-seeded "default" is normally
-- the oldest row); force it enabled so the default is never disabled, even if
-- every existing template happens to be disabled. Empty instances are handled by
-- the lazy seed, which inserts is_default = 1.
UPDATE `report_templates` SET `is_default` = 1, `enabled` = 1 WHERE `id` = (SELECT `id` FROM `report_templates` ORDER BY `enabled` DESC, `created_at` ASC, `id` ASC LIMIT 1);