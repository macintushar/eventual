import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "#/db";
import { channelIdentity, user } from "#/db/schema";
import {
	type ChannelAdapter,
	emailChannel,
	type NotificationPayload,
} from "./channels";

export function isSyntheticGuest(email: string) {
	return email.toLowerCase().endsWith("@guests.eventual.invalid");
}

export function createNotifier(
	db: Database,
	adapters: ChannelAdapter[] = [emailChannel],
) {
	return {
		async send(userId: string, kind: string, payload: NotificationPayload) {
			const recipient = await db.query.user.findFirst({
				where: eq(user.id, userId),
			});
			if (!recipient) return { skipped: true, deliveries: [] };
			const deliveries: string[] = [];
			for (const adapter of adapters) {
				if (
					adapter.channel === "email" &&
					(isSyntheticGuest(recipient.email) ||
						(kind === "reminder" && !recipient.emailReminders))
				)
					continue;
				const identity =
					adapter.channel === "email"
						? { address: recipient.email }
						: await db.query.channelIdentity.findFirst({
								where: and(
									eq(channelIdentity.userId, userId),
									eq(channelIdentity.channel, adapter.channel),
									isNotNull(channelIdentity.verifiedAt),
								),
							});
				if (identity)
					deliveries.push(
						await adapter.send(identity.address, kind, {
							...payload,
							idempotencyKey: `${payload.idempotencyKey}:${adapter.channel}`,
						}),
					);
			}
			return { skipped: deliveries.length === 0, deliveries };
		},
	};
}

export async function send(
	userId: string,
	kind: string,
	payload: NotificationPayload,
) {
	const { db } = await import("#/db");
	return createNotifier(db).send(userId, kind, payload);
}
