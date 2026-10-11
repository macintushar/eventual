import {
	type PushData,
	pushDataSchema,
	pushTypes,
} from "@eventual/schemas/push";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "#/db";
import {
	type activity,
	job,
	member,
	organization,
	pushDevice,
	user,
} from "#/db/schema";
import { env } from "#/env";
import type { Recipient } from "./domain/activity";
import { pushCopy, pushRecipients, wantsPush } from "./domain/push";
import { type ClaimedJob, completeJob, enqueueJob, ownedJob } from "./jobs";
import { type PushConfig, pushCapability } from "./push-config";
import { type PushSender, sendPush } from "./push-sender";
import { readPushPreferences } from "./services/push";

/** Called in the activity's transaction: domain write + feed + push outbox are atomic. */
export async function enqueueActivityPush(
	tx: Pick<Database, "insert" | "select">,
	row: typeof activity.$inferInsert,
	recipients: Recipient[],
	config?: PushConfig,
) {
	if (!pushCapability(config).available) return;
	const metadata = JSON.parse(row.metadata ?? "{}");
	const type =
		row.type === "expense.created" && metadata.recurring
			? "recurring.generated"
			: row.type;
	if (!(pushTypes as readonly string[]).includes(type)) return;
	const pushType = type as PushData["type"];
	const [group] = await tx
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, row.organizationId));
	const [actor] = await tx
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, row.actorUserId));
	if (!group || !actor) return;
	const preferences = new Map(
		await Promise.all(
			[...new Set(recipients.map((recipient) => recipient.userId))].map(
				async (userId) =>
					[userId, await readPushPreferences(tx, userId)] as const,
			),
		),
	);
	for (const userId of pushRecipients(
		recipients,
		row.actorUserId,
		row.organizationId,
		pushType,
		preferences,
	)) {
		const [membership] = await tx
			.select({ id: member.id })
			.from(member)
			.where(
				and(
					eq(member.organizationId, row.organizationId),
					eq(member.userId, userId),
				),
			);
		if (!membership) continue;
		const devices = await tx
			.select({ id: pushDevice.id })
			.from(pushDevice)
			.where(eq(pushDevice.userId, userId));
		const expenseId =
			row.targetType === "expense"
				? row.targetId
				: row.targetType === "expenseShare"
					? metadata.expenseId
					: undefined;
		const data: PushData = {
			origin: new URL(env.BETTER_AUTH_URL).origin,
			userId,
			groupId: row.organizationId,
			type: pushType,
			...(expenseId ? { expenseId } : {}),
		};
		await enqueueJob(tx, {
			kind: "push",
			dueAt: new Date(),
			dedupeKey: `push:${row.id}:${userId}`,
			payload: {
				body: pushCopy(pushType, actor.name, group.name),
				data,
				deviceIds: devices.map((device) => device.id),
			},
		});
	}
}

const pushJobSchema = z.object({
	body: z.string(),
	data: pushDataSchema,
	deviceIds: z.array(z.string()).optional(),
	deviceId: z.string().optional(),
});

/** Expand one recipient into independently retried devices, without storing raw tokens in jobs. */
export async function executePush(
	db: Database,
	claimed: ClaimedJob,
	sender: PushSender = sendPush,
) {
	const payload = pushJobSchema.parse(JSON.parse(claimed.payload));
	const { data } = payload;
	const [membership] = await db
		.select({ id: member.id })
		.from(member)
		.where(
			and(
				eq(member.organizationId, data.groupId),
				eq(member.userId, data.userId),
			),
		);
	if (
		!membership ||
		!wantsPush(
			await readPushPreferences(db, data.userId),
			data.groupId,
			data.type,
		)
	)
		return;
	if (claimed.kind === "push") {
		await db.transaction(async (tx) => {
			const owned = await tx
				.update(job)
				.set({ lockedAt: new Date() })
				.where(ownedJob(claimed))
				.returning();
			if (!owned.length) return;
			const ids = payload.deviceIds ?? [];
			const devices = ids.length
				? await tx
						.select({ id: pushDevice.id })
						.from(pushDevice)
						.where(
							and(
								eq(pushDevice.userId, data.userId),
								inArray(pushDevice.id, ids),
							),
						)
				: [];
			for (const device of devices)
				await enqueueJob(tx, {
					kind: "push-device",
					dueAt: new Date(),
					dedupeKey: `${claimed.dedupeKey}:${device.id}`,
					payload: { body: payload.body, data, deviceId: device.id },
				});
			await completeJob(tx, claimed);
		});
		return;
	}
	if (!payload.deviceId) throw new Error("Push delivery has no device");
	const [device] = await db
		.select()
		.from(pushDevice)
		.where(
			and(
				eq(pushDevice.id, payload.deviceId),
				eq(pushDevice.userId, data.userId),
			),
		);
	if (!device) return; // Signed out, deleted, or reassigned after enqueue.
	const result = await sender(device, { body: payload.body, data });
	if (result === "invalid")
		await db
			.delete(pushDevice)
			.where(
				and(
					eq(pushDevice.id, device.id),
					eq(pushDevice.userId, data.userId),
					eq(pushDevice.token, device.token),
					eq(pushDevice.lastSeenAt, device.lastSeenAt),
				),
			);
}
