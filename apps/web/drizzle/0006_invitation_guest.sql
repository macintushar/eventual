ALTER TABLE `invitation` ADD `guest_user_id` text REFERENCES user(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `invitation_guestUserId_idx` ON `invitation` (`guest_user_id`);