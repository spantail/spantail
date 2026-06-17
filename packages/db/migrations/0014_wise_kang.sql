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
-- Rebuild report_deliveries to add batch_id as NOT NULL. SQLite can't ADD a
-- NOT NULL column to a populated table, and leaving it nullable would let a
-- send handled by the pre-deploy Worker insert a NULL batch (breaking Sent
-- grouping/flagging). Existing rows backfill batch_id = id (each a singleton
-- batch).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_report_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text,
	`sender_user_id` text,
	`recipient_user_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`sender_name` text NOT NULL,
	`sender_email` text NOT NULL,
	`report_name` text NOT NULL,
	`date_from` text NOT NULL,
	`date_to` text NOT NULL,
	`rendered_markdown` text NOT NULL,
	`message` text,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_report_deliveries`("id", "report_id", "sender_user_id", "recipient_user_id", "batch_id", "sender_name", "sender_email", "report_name", "date_from", "date_to", "rendered_markdown", "message", "read_at", "created_at") SELECT "id", "report_id", "sender_user_id", "recipient_user_id", "id", "sender_name", "sender_email", "report_name", "date_from", "date_to", "rendered_markdown", "message", "read_at", "created_at" FROM `report_deliveries`;--> statement-breakpoint
DROP TABLE `report_deliveries`;--> statement-breakpoint
ALTER TABLE `__new_report_deliveries` RENAME TO `report_deliveries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `report_deliveries_recipient_idx` ON `report_deliveries` (`recipient_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `report_deliveries_sender_batch_idx` ON `report_deliveries` (`sender_user_id`,`batch_id`,`created_at`);