ALTER TABLE `report_templates` ADD `is_default` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `report_templates` ADD `name_template` text;--> statement-breakpoint
ALTER TABLE `report_templates` ADD `note_template` text;--> statement-breakpoint
-- Backfill: an instance that already has templates needs exactly one default.
-- Prefer the earliest enabled template (the lazily-seeded "default" is normally
-- the oldest row); force it enabled so the default is never disabled, even if
-- every existing template happens to be disabled. Empty instances are handled by
-- the lazy seed, which inserts is_default = 1.
UPDATE `report_templates` SET `is_default` = 1, `enabled` = 1 WHERE `id` = (SELECT `id` FROM `report_templates` ORDER BY `enabled` DESC, `created_at` ASC, `id` ASC LIMIT 1);--> statement-breakpoint
-- Backfill the name Liquid for existing templates: the client-side auto-name
-- (`{workspace} {user} {period}`) was removed, so without this every migrated
-- template — including the seeded default — would stop auto-naming reports until
-- an admin edited it. New templates created after the upgrade opt in explicitly.
-- The literal mirrors @spantail/templates' DEFAULT_NAME_TEMPLATE (migrations are
-- frozen snapshots and never import app code).
UPDATE `report_templates` SET `name_template` = '{% if workspaces.size == 1 %}{{ workspaces[0].name }} {% endif %}{{ user.name }} {{ period.label }}' WHERE `name_template` IS NULL;