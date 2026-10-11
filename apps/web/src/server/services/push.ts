import {
	type PushPreferences,
	registerPushDeviceSchema,
	updatePushPreferencesSchema,
} from "@eventual/schemas/push";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "#/db";
import { member, pushDevice, pushGroupMute, pushPreference } from "#/db/schema";
import type { Ctx } from "#/server/context";
import { defaultPushPreferences } from "#/server/domain/push";
import { AppError } from "#/server/errors";
import { type PushConfig, pushPlatforms } from "#/server/push-config";

function sessionOnly(ctx: Ctx) {
	if (ctx.apiKeyId || !ctx.session)
		throw new AppError(
			"FORBIDDEN",
			"Push settings require a signed-in session",
		);
}

function publicDevice(row: typeof pushDevice.$inferSelect) {
	return {
		id: row.id,
		platform: row.platform,
		appVersion: row.appVersion,
		locale: row.locale,
		createdAt: row.createdAt,
		lastSeenAt: row.lastSeenAt,
	};
}

export async function registerPushDevice(
	ctx: Ctx,
	input: unknown,
	config?: PushConfig,
) {
	sessionOnly(ctx);
	const parsed = registerPushDeviceSchema.parse(input);
	if (!pushPlatforms(config)[parsed.platform])
		throw new AppError(
			"FORBIDDEN",
			"Push is unavailable for this platform on this server",
		);
	const now = new Date();
	const [row] = await ctx.db
		.insert(pushDevice)
		.values({
			id: crypto.randomUUID(),
			userId: ctx.user.id,
			...parsed,
			token:
				parsed.platform === "ios" ? parsed.token.toLowerCase() : parsed.token,
			createdAt: now,
			lastSeenAt: now,
		})
		.onConflictDoUpdate({
			target: pushDevice.token,
			set: {
				userId: ctx.user.id,
				platform: parsed.platform,
				appVersion: parsed.appVersion,
				locale: parsed.locale,
				lastSeenAt: now,
				// Retire queued deliveries and old sign-out handles when a token changes owner.
				id: sql`case when ${pushDevice.userId} <> ${ctx.user.id} then ${crypto.randomUUID()} else ${pushDevice.id} end`,
			},
		})
		.returning();
	return publicDevice(row);
}

export async function listPushDevices(ctx: Ctx) {
	sessionOnly(ctx);
	return (
		await ctx.db
			.select()
			.from(pushDevice)
			.where(eq(pushDevice.userId, ctx.user.id))
			.orderBy(asc(pushDevice.createdAt), asc(pushDevice.id))
	).map(publicDevice);
}

export async function deletePushDevice(ctx: Ctx, deviceId: string) {
	sessionOnly(ctx);
	await ctx.db
		.delete(pushDevice)
		.where(
			and(eq(pushDevice.id, deviceId), eq(pushDevice.userId, ctx.user.id)),
		);
	return { success: true as const };
}

export async function readPushPreferences(
	db: Pick<Database, "select">,
	userId: string,
): Promise<PushPreferences> {
	const [row] = await db
		.select()
		.from(pushPreference)
		.where(eq(pushPreference.userId, userId));
	const mutes = await db
		.select({ groupId: pushGroupMute.groupId })
		.from(pushGroupMute)
		.where(eq(pushGroupMute.userId, userId))
		.orderBy(asc(pushGroupMute.groupId));
	return {
		expenses: row?.expenses ?? defaultPushPreferences.expenses,
		payments: row?.payments ?? defaultPushPreferences.payments,
		recurring: row?.recurring ?? defaultPushPreferences.recurring,
		mutedGroupIds: mutes.map((mute) => mute.groupId),
	};
}

export async function getPushPreferences(ctx: Ctx) {
	sessionOnly(ctx);
	return readPushPreferences(ctx.db, ctx.user.id);
}

export async function updatePushPreferences(
	ctx: Ctx,
	input: z.input<typeof updatePushPreferencesSchema>,
) {
	sessionOnly(ctx);
	const { mutedGroupIds, ...categories } =
		updatePushPreferencesSchema.parse(input);
	return ctx.db.transaction(async (tx) => {
		// UPSERT patches only supplied categories, serializing concurrent partial updates.
		await tx
			.insert(pushPreference)
			.values({ userId: ctx.user.id, ...categories })
			.onConflictDoUpdate({
				target: pushPreference.userId,
				set: Object.keys(categories).length
					? categories
					: { userId: ctx.user.id },
			});
		if (mutedGroupIds !== undefined) {
			const ids = [...new Set(mutedGroupIds)];
			const memberships = ids.length
				? await tx
						.select({ groupId: member.organizationId })
						.from(member)
						.where(
							and(
								eq(member.userId, ctx.user.id),
								inArray(member.organizationId, ids),
							),
						)
				: [];
			if (memberships.length !== ids.length)
				throw new AppError("FORBIDDEN", "Only your groups can be muted");
			await tx
				.delete(pushGroupMute)
				.where(eq(pushGroupMute.userId, ctx.user.id));
			if (ids.length)
				await tx
					.insert(pushGroupMute)
					.values(ids.map((groupId) => ({ userId: ctx.user.id, groupId })));
		}
		return readPushPreferences(tx, ctx.user.id);
	});
}
