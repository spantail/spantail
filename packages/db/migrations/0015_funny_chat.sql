ALTER TABLE `instance_settings` ADD `google_oauth_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `instance_settings` ADD `github_oauth_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `instance_settings` ADD `google_allowed_domains` text DEFAULT '[]' NOT NULL;