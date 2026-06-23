CREATE TABLE `agent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`session_id` text NOT NULL,
	`source_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`model` text,
	`usage` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_events_source_uq` ON `agent_events` (`agent_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `agent_events_session_idx` ON `agent_events` (`agent_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `agent_events_workspace_idx` ON `agent_events` (`workspace_id`,`created_at`);