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
CREATE INDEX `delivery_flags_user_scope_idx` ON `delivery_flags` (`user_id`,`scope`);