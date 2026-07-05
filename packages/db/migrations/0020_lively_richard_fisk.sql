CREATE TABLE `work_entry_agent_entries` (
	`work_entry_id` text NOT NULL,
	`agent_entry_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`work_entry_id`, `agent_entry_id`),
	FOREIGN KEY (`work_entry_id`) REFERENCES `work_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_entry_id`) REFERENCES `agent_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `work_entry_agent_entries_agent_entry_idx` ON `work_entry_agent_entries` (`agent_entry_id`);