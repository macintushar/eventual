import { and, desc, eq, inArray, lt, or, type SQL } from "drizzle-orm";
import {
	activity,
	activityRecipient,
	expense,
	member,
	organization,
	user,
} from "#/db/schema";
import type { Ctx } from "#/server/context";
import { AppError } from "#/server/errors";
import { membership } from "./shared";

export async function listActivity(
	ctx: Ctx,
	input: { groupId: string; cursor?: string; limit?: number },
) {
	await membership(ctx, input.groupId);
	const clauses = [eq(activity.organizationId, input.groupId)];
	if (input.cursor) clauses.push(lt(activity.id, input.cursor));
	const rows = await ctx.db
		.select({ activity, actorName: user.name })
		.from(activity)
		.innerJoin(user, eq(activity.actorUserId, user.id))
		.where(and(...clauses))
		.orderBy(desc(activity.createdAt), desc(activity.id))
		.limit(input.limit ?? 30);
	return {
		items: rows.map((row) => ({
			...row.activity,
			actorName: row.actorName,
			metadata: JSON.parse(row.activity.metadata),
		})),
		nextCursor:
			rows.length === (input.limit ?? 30) ? rows.at(-1)?.activity.id : null,
	};
}

/**
 * The caller's personal feed: every activity, across every group, that
 * involved them. Membership isn't checked — a recipient row is itself the
 * grant, which is what lets someone see that they were removed from a group.
 *
 * Pages on `(createdAt, activityId)` rather than the id alone, because ids are
 * random UUIDs and would skip or repeat rows that share a timestamp.
 */
export async function listMyActivity(
	ctx: Ctx,
	input: { cursor?: string; limit?: number } = {},
) {
	const limit = Math.min(Math.max(Math.trunc(input.limit || 30), 1), 100);
	const clauses: (SQL | undefined)[] = [
		eq(activityRecipient.userId, ctx.user.id),
	];
	if (input.cursor) {
		const [ms, activityId] = input.cursor.split("_");
		const at = new Date(Number(ms));
		if (!activityId || Number.isNaN(at.getTime()))
			throw new AppError("VALIDATION", "Invalid cursor");
		clauses.push(
			or(
				lt(activityRecipient.createdAt, at),
				and(
					eq(activityRecipient.createdAt, at),
					lt(activityRecipient.activityId, activityId),
				),
			),
		);
	}
	const rows = await ctx.db
		.select({
			activity,
			deltaMinor: activityRecipient.deltaMinor,
			createdAt: activityRecipient.createdAt,
			actorName: user.name,
			groupName: organization.name,
			memberId: member.id,
			expenseId: expense.id,
		})
		.from(activityRecipient)
		.innerJoin(activity, eq(activityRecipient.activityId, activity.id))
		.innerJoin(user, eq(activity.actorUserId, user.id))
		.innerJoin(organization, eq(activity.organizationId, organization.id))
		.leftJoin(
			member,
			and(
				eq(member.organizationId, activity.organizationId),
				eq(member.userId, ctx.user.id),
			),
		)
		.leftJoin(expense, eq(expense.id, activity.targetId))
		.where(and(...clauses))
		.orderBy(
			desc(activityRecipient.createdAt),
			desc(activityRecipient.activityId),
		)
		.limit(limit);

	const items = rows.map((row) => ({
		...row.activity,
		metadata: JSON.parse(row.activity.metadata),
		actorName: row.actorName,
		groupName: row.groupName,
		deltaMinor: row.deltaMinor,
		/** Still in the group, so it's somewhere they can go. */
		isMember: row.memberId !== null,
		/** Set only while the expense this is about still exists. */
		expenseId: row.expenseId,
	}));

	// Metadata stores user ids, not names, so a rename shows everywhere at once.
	const userIds = new Set<string>();
	for (const item of items)
		for (const key of ["userId", "fromUserId", "toUserId", "paidByUserId"]) {
			const value = item.metadata[key];
			if (typeof value === "string") userIds.add(value);
		}
	const names = userIds.size
		? await ctx.db
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(inArray(user.id, [...userIds]))
		: [];

	const last = rows.at(-1);
	return {
		items,
		names: Object.fromEntries(names.map((row) => [row.id, row.name])),
		nextCursor:
			rows.length === limit && last
				? `${last.createdAt.getTime()}_${last.activity.id}`
				: null,
	};
}
