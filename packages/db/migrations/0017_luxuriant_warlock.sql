-- Rebuild report_shares as a reference to an immutable report_content version
-- (plus the minting user) instead of a frozen copy of the document. Existing
-- rows are carried over: a share's frozen body is a byte-for-byte copy of the
-- version it was minted from, so content equality resolves the version, and
-- the creator is the report owner (the only mint path until now). Tokens,
-- passcodes, expiry, revocation state, and view counters survive, so
-- published /share/:token URLs keep working across the upgrade.
--
-- The version lookups below pick the highest matching version (ORDER BY
-- version DESC LIMIT 1): versions are normally distinct byte-wise (the front
-- matter embeds the version number), but legacy pre-front-matter content can
-- repeat identical bodies across versions, and a bare join would then emit a
-- share id once per match and abort on the primary key.
CREATE TABLE `__new_report_shares` (
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
INSERT INTO `__new_report_shares` (
	`id`, `report_content_id`, `created_by_user_id`, `token`, `passcode_hash`,
	`expires_at`, `revoked_at`, `view_count`, `last_viewed_at`, `created_at`
)
SELECT
	s.`id`,
	(
		SELECT rc.`id` FROM `report_content` rc
		WHERE rc.`report_id` = s.`report_id`
			AND rc.`content` = s.`rendered_markdown`
		ORDER BY rc.`version` DESC LIMIT 1
	),
	r.`owner_user_id`, s.`token`, s.`passcode_hash`,
	s.`expires_at`, s.`revoked_at`, s.`view_count`, s.`last_viewed_at`, s.`created_at`
FROM `report_shares` s
JOIN `reports` r ON r.`id` = s.`report_id`
WHERE EXISTS (
	SELECT 1 FROM `report_content` rc
	WHERE rc.`report_id` = s.`report_id`
		AND rc.`content` = s.`rendered_markdown`
);
--> statement-breakpoint
DROP TABLE `report_shares`;--> statement-breakpoint
ALTER TABLE `__new_report_shares` RENAME TO `report_shares`;--> statement-breakpoint
CREATE UNIQUE INDEX `report_shares_token_unique` ON `report_shares` (`token`);--> statement-breakpoint
CREATE INDEX `report_shares_content_idx` ON `report_shares` (`report_content_id`);--> statement-breakpoint
ALTER TABLE `report_deliveries` ADD `report_content_id` text REFERENCES report_content(id) ON UPDATE no action ON DELETE cascade;--> statement-breakpoint
-- Backfill: a delivery's rendered_markdown is likewise a byte-for-byte copy of
-- the sent content version, so content equality resolves the version it
-- carried (highest match for determinism, as above). Deliveries cascade away
-- with their report, so a matching content row always exists.
UPDATE `report_deliveries` SET `report_content_id` = (
	SELECT rc.`id` FROM `report_content` rc
	WHERE rc.`report_id` = `report_deliveries`.`report_id`
		AND rc.`content` = `report_deliveries`.`rendered_markdown`
	ORDER BY rc.`version` DESC LIMIT 1
);
