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
CREATE INDEX `report_shares_content_idx` ON `report_shares` (`report_content_id`);