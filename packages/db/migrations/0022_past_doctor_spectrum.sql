ALTER TABLE `user` ADD `disabled` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `user_invitations` ADD `grant_can_manage_templates` integer DEFAULT false NOT NULL;