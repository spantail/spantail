CREATE TABLE `delivery_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`target_id` text NOT NULL,
	`starred_at` integer,
	`archived_at` integer,
	`trashed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_flags_user_target_uq` ON `delivery_flags` (`user_id`,`scope`,`target_id`);--> statement-breakpoint
CREATE INDEX `delivery_flags_user_scope_idx` ON `delivery_flags` (`user_id`,`scope`);--> statement-breakpoint
-- Add nullable, then backfill: SQLite can't ADD a NOT NULL column to a populated
-- table, and each legacy delivery is its own singleton batch (batch_id = id).
-- The app always sets batch_id on insert; the schema models it as NOT NULL.
ALTER TABLE `report_deliveries` ADD `batch_id` text;--> statement-breakpoint
UPDATE `report_deliveries` SET `batch_id` = `id` WHERE `batch_id` IS NULL;--> statement-breakpoint
CREATE INDEX `report_deliveries_sender_batch_idx` ON `report_deliveries` (`sender_user_id`,`batch_id`,`created_at`);