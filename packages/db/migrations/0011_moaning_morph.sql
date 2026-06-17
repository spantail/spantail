PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_report_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text,
	`sender_user_id` text,
	`recipient_user_id` text NOT NULL,
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
INSERT INTO `__new_report_deliveries`("id", "report_id", "sender_user_id", "recipient_user_id", "sender_name", "sender_email", "report_name", "date_from", "date_to", "rendered_markdown", "message", "read_at", "created_at") SELECT "id", "report_id", "sender_user_id", "recipient_user_id", "sender_name", "sender_email", "report_name", "date_from", "date_to", "rendered_markdown", "message", "read_at", "created_at" FROM `report_deliveries`;--> statement-breakpoint
DROP TABLE `report_deliveries`;--> statement-breakpoint
ALTER TABLE `__new_report_deliveries` RENAME TO `report_deliveries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `report_deliveries_recipient_idx` ON `report_deliveries` (`recipient_user_id`,`created_at`);