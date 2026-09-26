import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "#/db";
import { job, member, organization, user } from "#/db/schema";
import type { Ctx } from "#/server/context";
import { AppError } from "#/server/errors";
import { type ClaimedJob, enqueueJob } from "#/server/jobs";
import { createNotifier, isSyntheticGuest } from "#/server/notifier";
import {
	reminderPreferencesSchema,
	scheduleReminderSchema,
} from "#/server/schemas/automation";
import { membership } from "./shared";

const reminderJobSchema = scheduleReminderSchema.extend({
	requestedByUserId: z.string().min(1),
});

export async function scheduleReminder(
	ctx: Ctx,
	input: z.infer<typeof scheduleReminderSchema>,
) {
	const parsed = scheduleReminderSchema.parse(input);
	if (parsed.dueAt.getTime() < Date.now())
		throw new AppError(
			"VALIDATION",
			"Reminder must be scheduled in the future",
		);
	await membership(ctx, parsed.groupId);
	const recipient = await ctx.db.query.user.findFirst({
		where: eq(user.id, parsed.userId),
	});
	const target = await ctx.db.query.member.findFirst({
		where: and(
			eq(member.organizationId, parsed.groupId),
			eq(member.userId, parsed.userId),
		),
	});
	if (!target || !recipient)
		throw new AppError("NOT_FOUND", "Group member not found");
	if (isSyntheticGuest(recipient.email))
		throw new AppError(
			"VALIDATION",
			"This guest has no deliverable email address",
		);
	return enqueueJob(ctx.db, {
		kind: "reminder",
		dueAt: parsed.dueAt,
		payload: { ...parsed, requestedByUserId: ctx.user.id },
		dedupeKey: `reminder:${parsed.groupId}:${parsed.userId}:${parsed.dueAt.toISOString()}`,
	});
}

export async function listReminders(ctx: Ctx, input: { groupId: string }) {
	await membership(ctx, input.groupId);
	return ctx.db
		.select()
		.from(job)
		.where(
			and(
				eq(job.kind, "reminder"),
				sql`json_extract(${job.payload}, '$.groupId') = ${input.groupId}`,
			),
		)
		.orderBy(desc(job.dueAt))
		.limit(100);
}

export async function getReminderPreferences(ctx: Ctx) {
	const row = await ctx.db.query.user.findFirst({
		where: eq(user.id, ctx.user.id),
	});
	if (!row) throw new AppError("NOT_FOUND", "User not found");
	return { emailReminders: row.emailReminders };
}

export async function updateReminderPreferences(
	ctx: Ctx,
	input: z.infer<typeof reminderPreferencesSchema>,
) {
	const preferences = reminderPreferencesSchema.parse(input);
	await ctx.db.update(user).set(preferences).where(eq(user.id, ctx.user.id));
	return preferences;
}

export async function executeReminder(
	db: Database,
	claimed: ClaimedJob,
	notifier = createNotifier(db),
) {
	const input = reminderJobSchema.parse(JSON.parse(claimed.payload));
	const group = await db.query.organization.findFirst({
		where: eq(organization.id, input.groupId),
	});
	if (!group || group.archivedAt) return;
	for (const userId of [input.userId, input.requestedByUserId]) {
		if (
			!(await db.query.member.findFirst({
				where: and(
					eq(member.organizationId, input.groupId),
					eq(member.userId, userId),
				),
			}))
		)
			return;
	}
	const { env } = await import("#/env");
	await notifier.send(input.userId, "reminder", {
		idempotencyKey: `job:${claimed.id}`,
		email: {
			kind: "reminder",
			groupName: group.name,
			url: new URL(
				`/app/groups/${encodeURIComponent(group.id)}`,
				env.BETTER_AUTH_URL,
			).toString(),
		},
	});
}
