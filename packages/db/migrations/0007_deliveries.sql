CREATE TABLE `report_deliveries` (
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
CREATE INDEX `report_deliveries_recipient_idx` ON `report_deliveries` (`recipient_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `report_deliveries_sender_batch_idx` ON `report_deliveries` (`sender_user_id`,`batch_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `report_deliveries_content_idx` ON `report_deliveries` (`report_content_id`);