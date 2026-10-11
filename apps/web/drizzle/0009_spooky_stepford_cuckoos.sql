CREATE TABLE `push_device` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`token` text NOT NULL,
	`app_version` text NOT NULL,
	`locale` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "push_device_platform" CHECK("push_device"."platform" in ('ios', 'android'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_device_token_unique` ON `push_device` (`token`);--> statement-breakpoint
CREATE INDEX `push_device_user_idx` ON `push_device` (`user_id`);--> statement-breakpoint
CREATE TABLE `push_group_mute` (
	`user_id` text NOT NULL,
	`group_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `group_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_preference` (
	`user_id` text PRIMARY KEY NOT NULL,
	`expenses` integer DEFAULT true NOT NULL,
	`payments` integer DEFAULT true NOT NULL,
	`recurring` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
