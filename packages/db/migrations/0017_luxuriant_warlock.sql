-- Rebuild report_shares as a reference to an immutable report_content version
-- (plus the minting user) instead of a frozen copy of the document. Existing
-- share rows cannot be mapped onto the new shape (they predate content
-- linkage), so the table is dropped and recreated: all previously issued share
-- links are invalidated by design.
DROP TABLE `report_shares`;--> statement-breakpoint
CREATE TABLE `report_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`report_content_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`token` text NOT NULL,
	`passcode_hash` text,
	`expires_at` integer,
	`revoked_at` integer,
	`view_count` integer DEFAULT 0 NOT NULL,
	`last_viewed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`report_content_id`) REFERENCES `report_content`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_shares_token_unique` ON `report_shares` (`token`);--> statement-breakpoint
CREATE INDEX `report_shares_content_idx` ON `report_shares` (`report_content_id`);--> statement-breakpoint
ALTER TABLE `report_deliveries` ADD `report_content_id` text REFERENCES report_content(id) ON UPDATE no action ON DELETE cascade;--> statement-breakpoint
-- Backfill: a delivery's rendered_markdown is a byte-for-byte copy of the sent
-- content version, and version bodies are unique per report (the front matter
-- embeds the version number), so the equality join resolves each delivery to
-- exactly the version it carried. Deliveries cascade away with their report,
-- so a matching content row always exists.
UPDATE `report_deliveries` SET `report_content_id` = (
	SELECT `id` FROM `report_content`
	WHERE `report_content`.`report_id` = `report_deliveries`.`report_id`
		AND `report_content`.`content` = `report_deliveries`.`rendered_markdown`
);
