-- Rebuild report_comments / report_reactions around a report_content reference:
-- discussion threads move from the report to the content version that was sent
-- (the same rebase shares and deliveries already went through), so recipients
-- of different versions no longer share one thread.
--
-- Every row is carried over — there is deliberately no WHERE filter. Existing
-- rows are re-keyed to the report's LATEST version (ORDER BY version DESC):
-- deployed instances predate report editing, so every report has exactly one
-- version and the mapping is unique and lossless. A report always has ≥1
-- content version (report_content is created with the report and never
-- deleted independently), so the subquery cannot come up empty; if it somehow
-- did, the NOT NULL constraint aborts this INSERT before the DROP below,
-- leaving the old table intact: the migration fails loudly instead of losing
-- data. Comments are rebuilt before reactions so the rebuilt report_comments
-- table exists for the comment_id FK.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_report_comments` (
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
INSERT INTO `__new_report_comments`("id", "report_content_id", "author_user_id", "author_name", "author_email", "body", "created_at", "updated_at") SELECT "id", (
	SELECT rc.`id` FROM `report_content` rc
	WHERE rc.`report_id` = `report_comments`.`report_id`
	ORDER BY rc.`version` DESC LIMIT 1
), "author_user_id", "author_name", "author_email", "body", "created_at", "updated_at" FROM `report_comments`;--> statement-breakpoint
DROP TABLE `report_comments`;--> statement-breakpoint
ALTER TABLE `__new_report_comments` RENAME TO `report_comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `report_comments_content_idx` ON `report_comments` (`report_content_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_report_reactions` (
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
INSERT INTO `__new_report_reactions`("id", "report_content_id", "comment_id", "user_id", "user_name", "emoji", "created_at") SELECT "id", (
	SELECT rc.`id` FROM `report_content` rc
	WHERE rc.`report_id` = `report_reactions`.`report_id`
	ORDER BY rc.`version` DESC LIMIT 1
), "comment_id", "user_id", "user_name", "emoji", "created_at" FROM `report_reactions`;--> statement-breakpoint
DROP TABLE `report_reactions`;--> statement-breakpoint
ALTER TABLE `__new_report_reactions` RENAME TO `report_reactions`;--> statement-breakpoint
CREATE INDEX `report_reactions_content_idx` ON `report_reactions` (`report_content_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_reactions_content_uq` ON `report_reactions` (`report_content_id`,`user_id`,`emoji`) WHERE comment_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX `report_reactions_comment_uq` ON `report_reactions` (`comment_id`,`user_id`,`emoji`) WHERE comment_id is not null;
