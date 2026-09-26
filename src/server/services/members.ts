import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { expense, expenseShare, member, user } from "#/db/schema";
import type { Ctx } from "#/server/context";
import { people } from "#/server/domain/activity";
import type { Participant } from "#/server/domain/split";
import { AppError } from "#/server/errors";
import {
	type UpdateMemberWeightInput,
	updateMemberWeightSchema,
} from "#/server/schemas/people";
import { getBalances } from "./balances";
import {
	activityRow,
	membership,
	type Role,
	recordActivity,
	requireRole,
} from "./shared";

export async function listMembers(ctx: Ctx, input: { groupId: string }) {
	await membership(ctx, input.groupId);
	return ctx.db
		.select({
			id: member.id,
			userId: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			upiVpa: user.upiVpa,
			wiseTag: user.wiseTag,
			role: member.role,
			weight: member.weight,
			isGuest: user.isGuest,
			claimedAt: user.claimedAt,
			createdAt: member.createdAt,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(eq(member.organizationId, input.groupId))
		.orderBy(asc(user.name));
}

async function assertCanExit(ctx: Ctx, groupId: string, userId: string) {
	const person = await ctx.db.query.user.findFirst({
		where: eq(user.id, userId),
		columns: { isGuest: true },
	});
	const balances = await getBalances(ctx, { groupId });
	const hasBalance = balances.members.some(
		(row) => row.userId === userId && row.balanceMinor !== 0,
	);
	const unpaid = await ctx.db
		.select({ id: expenseShare.id })
		.from(expenseShare)
		.innerJoin(expense, eq(expenseShare.expenseId, expense.id))
		.where(
			and(
				eq(expense.organizationId, groupId),
				eq(expenseShare.userId, userId),
				isNull(expenseShare.paidAt),
				ne(expense.paidByUserId, userId),
			),
		)
		.limit(1);
	if (hasBalance || unpaid.length)
		throw new AppError(
			"CONFLICT",
			person?.isGuest
				? "Settle this guest through payer-marked shares or a member payment before removing them"
				: "Settle this member's balance and unpaid shares before they leave",
		);
}

/** Resolve weights from trusted membership data, never from expense input. */
export async function weightedParticipants<T extends Participant>(
	ctx: Ctx,
	groupId: string,
	participants: T[],
) {
	await membership(ctx, groupId);
	if (
		!participants.length ||
		new Set(participants.map((p) => p.userId)).size !== participants.length
	)
		throw new AppError("VALIDATION", "Choose unique participants");
	const rows = await ctx.db
		.select()
		.from(member)
		.where(
			and(
				eq(member.organizationId, groupId),
				inArray(
					member.userId,
					participants.map((p) => p.userId),
				),
			),
		);
	if (rows.length !== participants.length)
		throw new AppError(
			"VALIDATION",
			"Every participant must be a current group member",
		);
	const weights = new Map(rows.map((row) => [row.userId, row.weight]));
	return participants.map((participant) => ({
		...participant,
		weight: weights.get(participant.userId) ?? 1,
	}));
}

export async function updateMemberWeight(
	ctx: Ctx,
	raw: UpdateMemberWeightInput,
) {
	const input = updateMemberWeightSchema.parse(raw);
	return ctx.db.transaction(async (tx) => {
		const mine = await tx.query.member.findFirst({
			where: and(
				eq(member.organizationId, input.groupId),
				eq(member.userId, ctx.user.id),
			),
		});
		if (!mine)
			throw new AppError("FORBIDDEN", "You are not a member of this group");
		requireRole(mine.role as Role, ["owner", "admin"]);
		const rows = await tx
			.update(member)
			.set({ weight: input.weight })
			.where(
				and(
					eq(member.organizationId, input.groupId),
					eq(member.userId, input.userId),
				),
			)
			.returning();
		if (!rows[0]) throw new AppError("NOT_FOUND", "Member not found");
		return rows[0];
	});
}

export { addMember } from "./guests";

async function ownerCount(ctx: Ctx, groupId: string) {
	const owners = await ctx.db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.organizationId, groupId), eq(member.role, "owner")));
	return owners.length;
}

export async function updateMemberRole(
	ctx: Ctx,
	input: { groupId: string; userId: string; role: Role },
) {
	const mine = await membership(ctx, input.groupId);
	requireRole(mine.role, ["owner"]);
	const target = await ctx.db.query.member.findFirst({
		where: and(
			eq(member.organizationId, input.groupId),
			eq(member.userId, input.userId),
		),
	});
	if (!target) throw new AppError("NOT_FOUND", "Member not found");
	if (
		target.role === "owner" &&
		input.role !== "owner" &&
		(await ownerCount(ctx, input.groupId)) === 1
	)
		throw new AppError("CONFLICT", "The last owner cannot be demoted");
	await ctx.db.transaction(async (tx) => {
		await tx
			.update(member)
			.set({ role: input.role })
			.where(eq(member.id, target.id));
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"member.role_changed",
				"member",
				target.id,
				{ userId: input.userId, from: target.role, to: input.role },
			),
			people(input.userId),
		);
	});
	return { success: true };
}

export async function removeMember(
	ctx: Ctx,
	input: { groupId: string; userId: string },
) {
	const mine = await membership(ctx, input.groupId);
	requireRole(mine.role, ["owner", "admin"]);
	const target = await ctx.db.query.member.findFirst({
		where: and(
			eq(member.organizationId, input.groupId),
			eq(member.userId, input.userId),
		),
	});
	if (!target) throw new AppError("NOT_FOUND", "Member not found");
	if (mine.role === "admin" && target.role !== "member")
		throw new AppError("FORBIDDEN", "Admins can only remove members");
	if (target.role === "owner" && (await ownerCount(ctx, input.groupId)) === 1)
		throw new AppError("CONFLICT", "The last owner cannot be removed");
	await assertCanExit(ctx, input.groupId, input.userId);
	await ctx.db.transaction(async (tx) => {
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"member.removed",
				"member",
				target.id,
				{ userId: input.userId },
			),
			people(input.userId),
		);
		await tx.delete(member).where(eq(member.id, target.id));
	});
	return { success: true };
}

export async function leaveGroup(ctx: Ctx, input: { groupId: string }) {
	const mine = await membership(ctx, input.groupId);
	if (mine.role === "owner" && (await ownerCount(ctx, input.groupId)) === 1)
		throw new AppError("CONFLICT", "The last owner cannot leave");
	await assertCanExit(ctx, input.groupId, ctx.user.id);
	await ctx.db.transaction(async (tx) => {
		await recordActivity(
			tx,
			activityRow(input.groupId, ctx.user.id, "member.left", "member", mine.id),
			people(ctx.user.id),
		);
		await tx.delete(member).where(eq(member.id, mine.id));
	});
	return { success: true };
}

export { updateMemberRole as updateMember };
