ALTER TABLE `agent_entries` ADD `context` text;--> statement-breakpoint
ALTER TABLE `agent_entries` ADD `rollup_event_count` integer;--> statement-breakpoint
ALTER TABLE `agent_events` ADD `operation` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_events` ADD `cost_usd` real;--> statement-breakpoint
ALTER TABLE `agent_events` ADD `attributes` text;