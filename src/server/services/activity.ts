import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
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
import {
	cursorScope,
	decodePageCursor,
	encodePageCursor,
	pageLimit,
} from "#/server/pagination";
import { membership } from "./shared";

export async function listActivity(
	ctx: Ctx,
	input: { groupId: string; cursor?: string; limit?: number },
) {
	await membership(ctx, input.groupId);
	const limit = pageLimit(input.limit);
	const scope = cursorScope(["activity", input.groupId]);
	const clauses = [eq(activity.organizationId, input.groupId)];
	if (input.cursor) {
		// Accept old UUID continuations during rollout, but seek on the full order.
		const legacy = /^[\da-f]{8}-[\da-f-]{27}$/i.test(input.cursor)
			? await ctx.db.query.activity.findFirst({
					where: and(
						eq(activity.id, input.cursor),
						eq(activity.organizationId, input.groupId),
					),
				})
			: null;
		const [at, id] = legacy
			? [legacy.createdAt.getTime() / 1000, legacy.id]
			: decodePageCursor(input.cursor, scope, ["number", "string"]);
		clauses.push(sql`(${activity.createdAt}, ${activity.id}) < (${at}, ${id})`);
	}
	const rows = await ctx.db
		.select({ activity, actorName: user.name })
		.from(activity)
		.innerJoin(user, eq(activity.actorUserId, user.id))
		.where(and(...clauses))
		.orderBy(desc(activity.createdAt), desc(activity.id))
		.limit(limit + 1);
	const page = rows.slice(0, limit);
	const last = page.at(-1)?.activity;
	return {
		items: page.map((row) => ({
			...row.activity,
			actorName: row.actorName,
			metadata: JSON.parse(row.activity.metadata),
		})),
		nextCursor:
			rows.length > limit && last
				? encodePageCursor(scope, [last.createdAt.getTime() / 1000, last.id])
				: null,
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
	const limit = pageLimit(input.limit);
	const scope = cursorScope(["activity.mine", ctx.user.id]);
	const clauses: (SQL | undefined)[] = [
		eq(activityRecipient.userId, ctx.user.id),
	];
	if (input.cursor) {
		const [ms, activityId] = /^\d+_[^_]+$/.test(input.cursor)
			? input.cursor.split("_")
			: decodePageCursor(input.cursor, scope, ["number", "string"]);
		const at = new Date(Number(ms));
		if (!activityId || Number.isNaN(at.getTime()))
			throw new AppError("VALIDATION", "Invalid cursor");
		clauses.push(
			sql`(${activityRecipient.createdAt}, ${activityRecipient.activityId}) < (${at.getTime()}, ${String(activityId)})`,
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
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	const items = page.map((row) => ({
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

	const last = page.at(-1);
	return {
		items,
		names: Object.fromEntries(names.map((row) => [row.id, row.name])),
		nextCursor:
			rows.length > limit && last
				? encodePageCursor(scope, [last.createdAt.getTime(), last.activity.id])
				: null,
	};
}
