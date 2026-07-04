-- Rebuild report_deliveries around its report_content reference: the version
-- id (added and backfilled in 0017) becomes NOT NULL and the sole link to the
-- report, and the frozen copies it made redundant (report_id, report_name,
-- date_from, date_to, rendered_markdown) are dropped. Body, name, and period
-- are now read from the referenced version at display time.
--
-- Every row is carried over — there is deliberately no WHERE filter. The
-- version id is COALESCE'd: normally the 0017 backfill (or the Worker) already
-- wrote it, and the stored id is validated against report_content rather than
-- trusted (PRAGMA foreign_keys=OFF would otherwise carry a dangling id — e.g.
-- from some past unenforced-FK write — into the rebuilt table unchecked); a
-- missing or unvalidated id falls back to content equality exactly like 0017's
-- backfill, picking the highest matching version for determinism across
-- repeated legacy bodies. If neither resolves — a state the cascade rules make
-- unreachable — the NOT NULL constraint aborts this INSERT before the DROP
-- below, leaving the old table intact: the migration fails loudly instead of
-- losing data.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_report_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`report_content_id` text NOT NULL,
	`sender_user_id` text,
	`recipient_user_id` text NOT NULL,
	`batch_id` text,
	`sender_name` text NOT NULL,
	`sender_email` text NOT NULL,
	`message` text,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`report_content_id`) REFERENCES `report_content`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_report_deliveries`("id", "report_content_id", "sender_user_id", "recipient_user_id", "batch_id", "sender_name", "sender_email", "message", "read_at", "created_at") SELECT "id", COALESCE(
	(
		SELECT rc.`id` FROM `report_content` rc
		WHERE rc.`id` = `report_deliveries`.`report_content_id`
	),
	(
		SELECT rc.`id` FROM `report_content` rc
		WHERE rc.`report_id` = `report_deliveries`.`report_id`
			AND rc.`content` = `report_deliveries`.`rendered_markdown`
		ORDER BY rc.`version` DESC LIMIT 1
	)
), "sender_user_id", "recipient_user_id", "batch_id", "sender_name", "sender_email", "message", "read_at", "created_at" FROM `report_deliveries`;--> statement-breakpoint
DROP TABLE `report_deliveries`;--> statement-breakpoint
ALTER TABLE `__new_report_deliveries` RENAME TO `report_deliveries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `report_deliveries_recipient_idx` ON `report_deliveries` (`recipient_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `report_deliveries_sender_batch_idx` ON `report_deliveries` (`sender_user_id`,`batch_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `report_deliveries_content_idx` ON `report_deliveries` (`report_content_id`);