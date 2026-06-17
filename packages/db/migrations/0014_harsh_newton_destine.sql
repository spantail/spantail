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
-- Nullable for an order-safe rollout (migrate-then-deploy): a send handled by
-- the old Worker before the new one ships inserts no batch_id, and a NOT NULL
-- column would make that send fail. Existing rows backfill batch_id = id (each
-- a singleton batch); queries COALESCE(batch_id, id) so a NULL is treated as a
-- singleton batch, never a null grouping/flag key.
ALTER TABLE `report_deliveries` ADD `batch_id` text;--> statement-breakpoint
UPDATE `report_deliveries` SET `batch_id` = `id` WHERE `batch_id` IS NULL;--> statement-breakpoint
CREATE INDEX `report_deliveries_sender_batch_idx` ON `report_deliveries` (`sender_user_id`,`batch_id`,`created_at`);