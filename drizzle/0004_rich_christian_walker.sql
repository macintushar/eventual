CREATE TABLE `category_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`pattern` text NOT NULL,
	`category` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `category_rule_group_idx` ON `category_rule` (`organization_id`);--> statement-breakpoint
CREATE TABLE `channel_identity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`address` text NOT NULL,
	`verified_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_address_unique` ON `channel_identity` (`channel`,`address`);--> statement-breakpoint
CREATE INDEX `channel_user_idx` ON `channel_identity` (`user_id`);--> statement-breakpoint
CREATE TABLE `expense_template` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`recurrence` text NOT NULL,
	`next_run_at` integer NOT NULL,
	`payload` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expense_template_due_idx` ON `expense_template` (`active`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `idempotency_key` (
	`key` text NOT NULL,
	`user_id` text NOT NULL,
	`operation` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`key`, `user_id`, `operation`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `job` (
	`id` text PRIMARY KEY NOT NULL,
	`due_at` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_at` integer,
	`lock_token` text,
	`completed_at` integer,
	`last_error` text,
	`dedupe_key` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_dedupe_key_unique` ON `job` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `job_due_idx` ON `job` (`completed_at`,`due_at`);--> statement-breakpoint
ALTER TABLE `expense` ADD `category` text;--> statement-breakpoint
ALTER TABLE `expense` ADD `search_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "member_weight_positive" CHECK("__new_member"."weight" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_member`("id", "organization_id", "user_id", "role", "weight", "created_at") SELECT "id", "organization_id", "user_id", "role", 1, "created_at" FROM `member`;--> statement-breakpoint
DROP TABLE `member`;--> statement-breakpoint
ALTER TABLE `__new_member` RENAME TO `member`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_organization_user_unique` ON `member` (`organization_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `organization` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `is_guest` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `claimed_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `email_reminders` integer DEFAULT true NOT NULL;
