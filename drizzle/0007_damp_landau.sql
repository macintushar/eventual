ALTER TABLE `user` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `user` ADD `is_email_public` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `is_phone_public` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `activity_page_idx` ON `activity` (`organization_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_recipient_page_idx` ON `activity_recipient` (`user_id`,`created_at`,`activity_id`);--> statement-breakpoint
CREATE INDEX `expense_page_idx` ON `expense` (`organization_id`,`date`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `settlement_page_idx` ON `settlement` (`organization_id`,`created_at`,`id`);