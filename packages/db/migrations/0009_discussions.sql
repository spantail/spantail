CREATE TABLE `report_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`report_content_id` text NOT NULL,
	`author_user_id` text,
	`author_name` text NOT NULL,
	`author_email` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`report_content_id`) REFERENCES `report_content`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `report_comments_content_idx` ON `report_comments` (`report_content_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `report_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`report_content_id` text NOT NULL,
	`comment_id` text,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`report_content_id`) REFERENCES `report_content`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment_id`) REFERENCES `report_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `report_reactions_content_idx` ON `report_reactions` (`report_content_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_reactions_content_uq` ON `report_reactions` (`report_content_id`,`user_id`,`emoji`) WHERE comment_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX `report_reactions_comment_uq` ON `report_reactions` (`comment_id`,`user_id`,`emoji`) WHERE comment_id is not null;