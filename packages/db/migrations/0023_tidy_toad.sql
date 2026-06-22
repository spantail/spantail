-- Existing share bodies lived in R2 (removed in this change) and cannot be
-- backfilled into the new column, so drop any pre-existing shares before adding
-- it NOT NULL. Pre-public: published links are recreated, not migrated.
DELETE FROM `report_shares`;--> statement-breakpoint
ALTER TABLE `report_shares` ADD `rendered_markdown` text NOT NULL;