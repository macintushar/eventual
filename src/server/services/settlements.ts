import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
	expense,
	expenseShare,
	settlement,
	settlementAllocation,
} from "#/db/schema";
import { validateRepayment } from "#/lib/settlements";
import type { Ctx } from "#/server/context";
import { people } from "#/server/domain/activity";
import { AppError } from "#/server/errors";
import type { CreateSettlementInput } from "#/server/schemas";
import { readBalances } from "./balances";
import { listMembers } from "./members";
import {
	activityRow,
	assertExpenseMembers,
	id,
	membership,
	recordActivity,
} from "./shared";

export { getBalances } from "./balances";

export async function listSettlements(ctx: Ctx, input: { groupId: string }) {
	await membership(ctx, input.groupId);
	return ctx.db.query.settlement.findMany({
		where: eq(settlement.organizationId, input.groupId),
		with: { from: true, to: true, allocations: true },
		orderBy: desc(settlement.createdAt),
	});
}

export async function createSettlement(ctx: Ctx, input: CreateSettlementInput) {
	await membership(ctx, input.groupId);
	if (input.toUserId === ctx.user.id)
		throw new AppError(
			"VALIDATION",
			"A settlement must be between two different members",
		);
	await assertExpenseMembers(ctx, input.groupId, input.toUserId, [ctx.user.id]);
	const members = await listMembers(ctx, input);
	const settlementId = id();
	const now = new Date();
	await ctx.db.transaction(async (tx) => {
		const balances = await readBalances(tx, input.groupId, members);
		const invalid = validateRepayment(balances.transfers, {
			...input,
			fromUserId: ctx.user.id,
		});
		if (invalid) throw new AppError("VALIDATION", invalid);
		const candidates = await tx
			.select({ share: expenseShare, expense })
			.from(expenseShare)
			.innerJoin(expense, eq(expenseShare.expenseId, expense.id))
			.where(
				and(
					eq(expense.organizationId, input.groupId),
					eq(expenseShare.userId, ctx.user.id),
					eq(expense.paidByUserId, input.toUserId),
					eq(expense.currency, input.currency),
					isNull(expenseShare.paidAt),
				),
			)
			.orderBy(asc(expense.date), asc(expense.createdAt));
		await tx.insert(settlement).values({
			id: settlementId,
			organizationId: input.groupId,
			fromUserId: ctx.user.id,
			toUserId: input.toUserId,
			amountMinor: input.amountMinor,
			currency: input.currency,
			note: input.note,
			createdByUserId: ctx.user.id,
			createdAt: now,
		});
		let remaining = input.amountMinor;
		for (const candidate of candidates) {
			if (candidate.share.amountMinor > remaining) break;
			await tx
				.update(expenseShare)
				.set({ paidAt: now, paidMarkedByUserId: ctx.user.id })
				.where(eq(expenseShare.id, candidate.share.id));
			await tx.insert(settlementAllocation).values({
				id: id(),
				settlementId,
				expenseShareId: candidate.share.id,
				amountMinor: candidate.share.amountMinor,
			});
			remaining -= candidate.share.amountMinor;
		}
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"settlement.created",
				"settlement",
				settlementId,
				{
					fromUserId: ctx.user.id,
					toUserId: input.toUserId,
					amountMinor: input.amountMinor,
					currency: input.currency,
				},
			),
			people(ctx.user.id, input.toUserId),
		);
	});
	return ctx.db.query.settlement.findFirst({
		where: eq(settlement.id, settlementId),
		with: { allocations: true },
	});
}

export async function deleteSettlement(
	ctx: Ctx,
	input: { settlementId: string },
) {
	const row = await ctx.db.query.settlement.findFirst({
		where: eq(settlement.id, input.settlementId),
		with: { allocations: true },
	});
	if (!row) throw new AppError("NOT_FOUND", "Settlement not found");
	await membership(ctx, row.organizationId);
	await ctx.db.transaction(async (tx) => {
		if (row.allocations.length)
			await tx
				.update(expenseShare)
				.set({ paidAt: null, paidMarkedByUserId: null })
				.where(
					inArray(
						expenseShare.id,
						row.allocations.map((allocation) => allocation.expenseShareId),
					),
				);
		await recordActivity(
			tx,
			activityRow(
				row.organizationId,
				ctx.user.id,
				"settlement.deleted",
				"settlement",
				row.id,
				{
					fromUserId: row.fromUserId,
					toUserId: row.toUserId,
					amountMinor: row.amountMinor,
					currency: row.currency,
				},
			),
			people(row.fromUserId, row.toUserId),
		);
		await tx.delete(settlement).where(eq(settlement.id, row.id));
	});
	return { success: true };
}
