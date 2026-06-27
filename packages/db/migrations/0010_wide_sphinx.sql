PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text,
	`agent_id` text NOT NULL,
	`session_id` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`usage` text,
	`description` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent_entries`("id", "workspace_id", "owner_user_id", "project_id", "agent_id", "session_id", "duration_minutes", "usage", "description", "started_at", "ended_at", "created_at", "updated_at") SELECT "id", "workspace_id", "owner_user_id", "project_id", "agent_id", "session_id", "duration_minutes", "usage", "description", coalesce("started_at", "created_at"), "ended_at", "created_at", "updated_at" FROM `agent_entries`;--> statement-breakpoint
DROP TABLE `agent_entries`;--> statement-breakpoint
ALTER TABLE `__new_agent_entries` RENAME TO `agent_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_entries_session_uq` ON `agent_entries` (`agent_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `agent_entries_workspace_idx` ON `agent_entries` (`workspace_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `agent_entries_agent_idx` ON `agent_entries` (`agent_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `timezone` text;--> statement-breakpoint
--> Backfill each user's timezone from a workspace they belong to (owned first,
--> else earliest-joined) so existing users keep their current local dates before
--> the workspace timezone is dropped. Users with no membership stay NULL (UTC).
UPDATE `user` SET `timezone` = (
	SELECT `w`.`timezone`
	FROM `workspace_members` `m`
	JOIN `workspaces` `w` ON `w`.`id` = `m`.`workspace_id`
	WHERE `m`.`user_id` = `user`.`id`
	ORDER BY (`m`.`role` = 'owner') DESC, `m`.`created_at` ASC
	LIMIT 1
);--> statement-breakpoint
ALTER TABLE `workspaces` DROP COLUMN `timezone`;