CREATE TABLE `instance_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`email_enabled` integer DEFAULT false NOT NULL,
	`email_from_address` text,
	`email_from_name` text,
	`google_oauth_enabled` integer DEFAULT false NOT NULL,
	`github_oauth_enabled` integer DEFAULT false NOT NULL,
	`google_allowed_domains` text DEFAULT '[]' NOT NULL,
	`agents_enabled` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`grant_admin` integer DEFAULT false NOT NULL,
	`grant_can_manage_templates` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_invitations_token_hash_unique` ON `user_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `user_invitations_email_idx` ON `user_invitations` (`email`);