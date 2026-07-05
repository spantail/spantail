-- Rebuild report_comments / report_reactions around a report_content reference:
-- discussion threads move from the report to the content version that was sent
-- (the same rebase shares and deliveries already went through), so recipients
-- of different versions no longer share one thread.
--
-- Every row is carried over — there is deliberately no WHERE filter. The old
-- schema records no comment→version mapping, so each row's version is
-- resolved from what the data can still prove, per report:
--   1. exactly one content version exists → that version;
--   2. several versions exist but every delivery references one single
--      version → that version. Writing to a discussion has always required
--      the report to be shared (≥1 delivery), so the only ever-delivered
--      version is the one the participants were discussing.
-- A report whose discussion satisfies neither rule (several versions
-- delivered, or the delivery evidence is gone because every recipient's
-- account deletion cascaded it away) is genuinely ambiguous — guessing
-- (e.g. the latest version) could attach comments written about one version
-- to another's thread, the exact mix-up this migration exists to end. There
-- the resolution yields NULL and the NOT NULL constraint aborts the copy:
-- the migration fails loudly instead of guessing or losing data. Reports
-- with multiple versions but no discussion rows are unaffected (the guard
-- is per row).
--
-- Statement order is chosen to be safe whether or not foreign keys are
-- enforced while it runs. D1 applies a migration inside a transaction, where
-- `PRAGMA foreign_keys=OFF` is a no-op — and with foreign keys enabled,
-- DROP TABLE performs an implicit DELETE FROM, so dropping the old
-- report_comments while any table still holds an ON DELETE CASCADE reference
-- to it would silently cascade-delete comment-level reactions. So: both
-- copies run first (reactions into a stage table with no FK clauses), every
-- failure mode (the guard, the NOT NULL re-key) trips before anything is
-- dropped, the child table drops before its parent, and the final reactions
-- table — the only one referencing report_comments — is created only after
-- the old report_comments is gone.
--
-- Preflight: fail before anything else if any discussion row is ambiguous
-- (same two-rule resolution as the copies below: neither a single existing
-- version nor a single ever-delivered version). The CHECK trips on a
-- non-zero count of such comments/reactions. The IF EXISTS drop only
-- matters after a failed non-transactional (manual) run, where the guard
-- table is left behind.
DROP TABLE IF EXISTS `__guard_0019_ambiguous_discussions`;--> statement-breakpoint
CREATE TABLE `__guard_0019_ambiguous_discussions` (`n` integer NOT NULL CHECK (`n` = 0));--> statement-breakpoint
INSERT INTO `__guard_0019_ambiguous_discussions` SELECT count(*) FROM (
	SELECT `report_id` FROM `report_comments`
	UNION ALL
	SELECT `report_id` FROM `report_reactions`
) d
WHERE (SELECT count(*) FROM `report_content` rc WHERE rc.`report_id` = d.`report_id`) > 1
	AND (
		SELECT count(DISTINCT rd.`report_content_id`) FROM `report_deliveries` rd
		JOIN `report_content` rc ON rc.`id` = rd.`report_content_id`
		WHERE rc.`report_id` = d.`report_id`
	) != 1;--> statement-breakpoint
DROP TABLE `__guard_0019_ambiguous_discussions`;--> statement-breakpoint
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
INSERT INTO `__new_report_comments`("id", "report_content_id", "author_user_id", "author_name", "author_email", "body", "created_at", "updated_at") SELECT "id", COALESCE(
	(
		SELECT max(rc.`id`) FROM `report_content` rc
		WHERE rc.`report_id` = `report_comments`.`report_id`
		HAVING count(*) = 1
	),
	(
		SELECT max(rd.`report_content_id`) FROM `report_deliveries` rd
		JOIN `report_content` rc ON rc.`id` = rd.`report_content_id`
		WHERE rc.`report_id` = `report_comments`.`report_id`
		HAVING count(DISTINCT rd.`report_content_id`) = 1
	)
), "author_user_id", "author_name", "author_email", "body", "created_at", "updated_at" FROM `report_comments`;--> statement-breakpoint
CREATE TABLE `__stage_report_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`report_content_id` text NOT NULL,
	`comment_id` text,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__stage_report_reactions`("id", "report_content_id", "comment_id", "user_id", "user_name", "emoji", "created_at") SELECT "id", COALESCE(
	(
		SELECT max(rc.`id`) FROM `report_content` rc
		WHERE rc.`report_id` = `report_reactions`.`report_id`
		HAVING count(*) = 1
	),
	(
		SELECT max(rd.`report_content_id`) FROM `report_deliveries` rd
		JOIN `report_content` rc ON rc.`id` = rd.`report_content_id`
		WHERE rc.`report_id` = `report_reactions`.`report_id`
		HAVING count(DISTINCT rd.`report_content_id`) = 1
	)
), "comment_id", "user_id", "user_name", "emoji", "created_at" FROM `report_reactions`;--> statement-breakpoint
DROP TABLE `report_reactions`;--> statement-breakpoint
DROP TABLE `report_comments`;--> statement-breakpoint
ALTER TABLE `__new_report_comments` RENAME TO `report_comments`;--> statement-breakpoint
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
INSERT INTO `__new_report_reactions`("id", "report_content_id", "comment_id", "user_id", "user_name", "emoji", "created_at") SELECT "id", "report_content_id", "comment_id", "user_id", "user_name", "emoji", "created_at" FROM `__stage_report_reactions`;--> statement-breakpoint
DROP TABLE `__stage_report_reactions`;--> statement-breakpoint
ALTER TABLE `__new_report_reactions` RENAME TO `report_reactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `report_reactions_content_idx` ON `report_reactions` (`report_content_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_reactions_content_uq` ON `report_reactions` (`report_content_id`,`user_id`,`emoji`) WHERE comment_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX `report_reactions_comment_uq` ON `report_reactions` (`comment_id`,`user_id`,`emoji`) WHERE comment_id is not null;
