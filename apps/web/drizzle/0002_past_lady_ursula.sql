CREATE TABLE `activity_recipient` (
	`activity_id` text NOT NULL,
	`user_id` text NOT NULL,
	`delta_minor` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`activity_id`, `user_id`),
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_recipient_user_created_idx` ON `activity_recipient` (`user_id`,`created_at`);--> statement-breakpoint
-- Backfill the personal feed from history. Best effort: edited expenses only
-- have their current shares left to read, and deleted ones have none, so those
-- rows get the expense as it stands today or no money line at all.
INSERT OR IGNORE INTO `activity_recipient` (`activity_id`, `user_id`, `delta_minor`, `created_at`)
SELECT a.`id`, s.`user_id`,
	(CASE WHEN e.`paid_by_user_id` = s.`user_id` THEN e.`amount_minor` ELSE 0 END) - s.`amount_minor`,
	a.`created_at` * 1000
FROM `activity` a
JOIN `expense` e ON e.`id` = a.`target_id`
JOIN `expense_share` s ON s.`expense_id` = e.`id`
WHERE a.`type` IN ('expense.created', 'expense.updated');
--> statement-breakpoint
INSERT OR IGNORE INTO `activity_recipient` (`activity_id`, `user_id`, `delta_minor`, `created_at`)
SELECT a.`id`, e.`paid_by_user_id`, e.`amount_minor`, a.`created_at` * 1000
FROM `activity` a
JOIN `expense` e ON e.`id` = a.`target_id`
WHERE a.`type` IN ('expense.created', 'expense.updated');
--> statement-breakpoint
INSERT OR IGNORE INTO `activity_recipient` (`activity_id`, `user_id`, `delta_minor`, `created_at`)
SELECT a.`id`, u.`id`, NULL, a.`created_at` * 1000
FROM `activity` a
JOIN `user` u ON u.`id` IN (
	json_extract(a.`metadata`, '$.fromUserId'),
	json_extract(a.`metadata`, '$.toUserId')
)
WHERE a.`type` IN ('settlement.created', 'settlement.deleted');
--> statement-breakpoint
INSERT OR IGNORE INTO `activity_recipient` (`activity_id`, `user_id`, `delta_minor`, `created_at`)
SELECT a.`id`, u.`id`, NULL, a.`created_at` * 1000
FROM `activity` a
JOIN `user` u ON u.`id` = json_extract(a.`metadata`, '$.userId')
WHERE a.`type` IN ('share.marked_paid', 'share.marked_unpaid', 'member.removed', 'member.role_changed');
--> statement-breakpoint
INSERT OR IGNORE INTO `activity_recipient` (`activity_id`, `user_id`, `delta_minor`, `created_at`)
SELECT a.`id`, e.`paid_by_user_id`, NULL, a.`created_at` * 1000
FROM `activity` a
JOIN `expense` e ON e.`id` = json_extract(a.`metadata`, '$.expenseId')
WHERE a.`type` IN ('share.marked_paid', 'share.marked_unpaid');
--> statement-breakpoint
INSERT OR IGNORE INTO `activity_recipient` (`activity_id`, `user_id`, `delta_minor`, `created_at`)
SELECT a.`id`, a.`actor_user_id`, NULL, a.`created_at` * 1000
FROM `activity` a
WHERE a.`type` IN ('member.joined', 'member.left');
--> statement-breakpoint
INSERT OR IGNORE INTO `activity_recipient` (`activity_id`, `user_id`, `delta_minor`, `created_at`)
SELECT a.`id`, u.`id`, NULL, a.`created_at` * 1000
FROM `activity` a
JOIN `user` u ON lower(u.`email`) = lower(json_extract(a.`metadata`, '$.email'))
WHERE a.`type` = 'member.invited';
