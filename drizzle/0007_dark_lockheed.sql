ALTER TABLE `user` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `user` ADD `is_email_public` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `is_phone_public` integer DEFAULT true NOT NULL;