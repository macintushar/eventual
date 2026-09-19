import { and, desc, eq, gte, lt, lte, or, sql } from "drizzle-orm";
import { expense, expenseShare } from "#/db/schema";
import { validateSharePayment } from "#/lib/settlements";
import type { Ctx } from "#/server/context";
import {
	expenseRecipients,
	people,
	updatedExpenseRecipients,
} from "#/server/domain/activity";
import { computeShares } from "#/server/domain/split";
import { AppError } from "#/server/errors";
import type { CreateExpenseInput, UpdateExpenseInput } from "#/server/schemas";
import {
	type BulkResplitInput,
	bulkResplitSchema,
	type ExpenseFilters,
} from "#/server/schemas/expenses";
import { readBalances } from "./balances";
import { normalizeSearchText, suggestCategory } from "./categories";
import { listMembers, weightedParticipants } from "./members";
import {
	activityRow,
	assertExpenseMembers,
	id,
	membership,
	recordActivity,
} from "./shared";

export async function getExpense(ctx: Ctx, input: { expenseId: string }) {
	const row = await ctx.db.query.expense.findFirst({
		where: eq(expense.id, input.expenseId),
		with: {
			payer: true,
			creator: true,
			shares: { with: { user: true, allocations: true } },
		},
	});
	if (!row) throw new AppError("NOT_FOUND", "Expense not found");
	await membership(ctx, row.organizationId);
	const lockedBy = row.shares
		.filter((share) => share.paidAt)
		.map((share) => ({
			userId: share.userId,
			name: share.user.name,
			paidAt: share.paidAt,
		}));
	return { ...row, locked: lockedBy.length > 0, lockedBy };
}

export function expenseFilterClauses(input: ExpenseFilters) {
	const clauses = [eq(expense.organizationId, input.groupId)];
	if (input.paidBy) clauses.push(eq(expense.paidByUserId, input.paidBy));
	if (input.from) clauses.push(gte(expense.date, input.from));
	if (input.to) clauses.push(lte(expense.date, input.to));
	if (input.category) clauses.push(eq(expense.category, input.category));
	if (input.currency) clauses.push(eq(expense.currency, input.currency));
	if (input.participant)
		clauses.push(
			sql`exists (select 1 from ${expenseShare} where ${expenseShare.expenseId} = ${expense.id} and ${expenseShare.userId} = ${input.participant})`,
		);
	const search = normalizeSearchText(input.search);
	if (search)
		clauses.push(
			sql`${expense.searchText} like ${`%${search.replace(/[\\%_]/g, "\\$&")}%`} escape '\\'`,
		);
	return clauses;
}

function encodeCursor(row: typeof expense.$inferSelect) {
	return Buffer.from(
		JSON.stringify([row.date.getTime(), row.createdAt.getTime(), row.id]),
	).toString("base64url");
}

export async function listExpenses(
	ctx: Ctx,
	input: ExpenseFilters & { cursor?: string; limit?: number },
) {
	await membership(ctx, input.groupId);
	const limit = input.limit ?? 30;
	if (!Number.isInteger(limit) || limit < 1 || limit > 100)
		throw new AppError("VALIDATION", "Limit must be between 1 and 100");
	const clauses = expenseFilterClauses(input);
	if (input.cursor) {
		let cursor: [number, number, string];
		try {
			cursor = JSON.parse(
				Buffer.from(input.cursor, "base64url").toString("utf8"),
			);
			if (
				!Array.isArray(cursor) ||
				cursor.length !== 3 ||
				!Number.isFinite(cursor[0]) ||
				!Number.isFinite(cursor[1]) ||
				!Number.isFinite(new Date(cursor[0]).getTime()) ||
				!Number.isFinite(new Date(cursor[1]).getTime()) ||
				typeof cursor[2] !== "string" ||
				!cursor[2]
			)
				throw new Error();
		} catch {
			throw new AppError("VALIDATION", "Invalid expense cursor");
		}
		const date = new Date(cursor[0]);
		const createdAt = new Date(cursor[1]);
		const cursorClause = or(
			lt(expense.date, date),
			and(eq(expense.date, date), lt(expense.createdAt, createdAt)),
			and(
				eq(expense.date, date),
				eq(expense.createdAt, createdAt),
				lt(expense.id, cursor[2]),
			),
		);
		if (cursorClause) clauses.push(cursorClause);
	}
	const rows = await ctx.db.query.expense.findMany({
		where: and(...clauses),
		with: { payer: true, shares: { with: { user: true } } },
		orderBy: [desc(expense.date), desc(expense.createdAt), desc(expense.id)],
		limit: limit + 1,
	});
	const page = rows.slice(0, limit);
	return {
		items: page.map((row) => ({
			...row,
			locked: row.shares.some((share) => share.paidAt !== null),
		})),
		nextCursor:
			rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
	};
}

export async function previewGroupExpense(
	ctx: Ctx,
	input: Parameters<typeof previewExpense>[0] & { groupId: string },
) {
	await membership(ctx, input.groupId);
	try {
		return previewExpense({
			...input,
			participants: await weightedParticipants(
				ctx,
				input.groupId,
				input.participants,
			),
		});
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError(
			"VALIDATION",
			error instanceof Error ? error.message : "Invalid split",
		);
	}
}

export function previewExpense(input: {
	amountMinor: number;
	currency?: string;
	splitMethod: CreateExpenseInput["splitMethod"];
	participants: CreateExpenseInput["participants"];
}) {
	return computeShares(
		input.amountMinor,
		input.splitMethod,
		input.participants,
		input.currency,
	);
}

export async function createExpense(ctx: Ctx, input: CreateExpenseInput) {
	await membership(ctx, input.groupId);
	await assertExpenseMembers(
		ctx,
		input.groupId,
		input.paidByUserId,
		input.participants.map((row) => row.userId),
	);
	let shares: ReturnType<typeof computeShares>;
	try {
		shares = computeShares(
			input.amountMinor,
			input.splitMethod,
			await weightedParticipants(ctx, input.groupId, input.participants),
			input.currency,
		);
	} catch (error) {
		throw new AppError(
			"VALIDATION",
			error instanceof Error ? error.message : "Invalid split",
		);
	}
	const expenseId = id();
	const category =
		input.category === undefined
			? (await suggestCategory(ctx, input)).category
			: input.category;
	const now = new Date();
	await ctx.db.transaction(async (tx) => {
		await tx.insert(expense).values({
			id: expenseId,
			organizationId: input.groupId,
			description: input.description,
			notes: input.notes,
			category,
			searchText: normalizeSearchText(input.description, input.notes, category),
			amountMinor: input.amountMinor,
			currency: input.currency,
			paidByUserId: input.paidByUserId,
			splitMethod: input.splitMethod,
			date: input.date,
			createdByUserId: ctx.user.id,
			createdAt: now,
			updatedAt: now,
		});
		await tx.insert(expenseShare).values(
			shares.map((share) => ({
				id: id(),
				expenseId,
				userId: share.userId,
				amountMinor: share.amountMinor,
				splitInput: share.splitInput,
			})),
		);
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"expense.created",
				"expense",
				expenseId,
				{
					description: input.description,
					amountMinor: input.amountMinor,
					currency: input.currency,
				},
			),
			expenseRecipients(input.paidByUserId, input.amountMinor, shares),
		);
	});
	return getExpense(ctx, { expenseId });
}

async function unlockedExpense(ctx: Ctx, expenseId: string) {
	const current = await getExpense(ctx, { expenseId });
	if (current.locked)
		throw new AppError(
			"EXPENSE_LOCKED",
			"A paid share must be unmarked before this expense can be changed",
			{ lockedBy: current.lockedBy },
		);
	return current;
}

export async function updateExpense(ctx: Ctx, input: UpdateExpenseInput) {
	return changeExpense(ctx, input.expenseId, () => input);
}

/** The first statement obtains SQLite's writer lock before any lock/state reads. */
async function lockExpense(tx: Pick<Ctx["db"], "update">, expenseId: string) {
	await tx
		.update(expense)
		.set({ updatedAt: sql`${expense.updatedAt}` })
		.where(eq(expense.id, expenseId));
}

async function changeExpense(
	ctx: Ctx,
	expenseId: string,
	makeInput: (
		current: Awaited<ReturnType<typeof getExpense>>,
	) => UpdateExpenseInput,
) {
	await ctx.db.transaction(async (tx) => {
		await lockExpense(tx, expenseId);
		const txCtx = { ...ctx, db: tx as unknown as Ctx["db"] };
		const current = await unlockedExpense(txCtx, expenseId);
		const input = makeInput(current);
		await assertExpenseMembers(
			txCtx,
			current.organizationId,
			input.paidByUserId,
			input.participants.map((row) => row.userId),
		);
		let shares: ReturnType<typeof computeShares>;
		try {
			shares = computeShares(
				input.amountMinor,
				input.splitMethod,
				await weightedParticipants(
					txCtx,
					current.organizationId,
					input.participants,
				),
				input.currency,
			);
		} catch (error) {
			throw new AppError(
				"VALIDATION",
				error instanceof Error ? error.message : "Invalid split",
			);
		}
		const category =
			input.category === undefined ? current.category : input.category;
		await tx
			.update(expense)
			.set({
				description: input.description,
				notes: input.notes,
				category,
				searchText: normalizeSearchText(
					input.description,
					input.notes === undefined ? current.notes : input.notes,
					category,
				),
				amountMinor: input.amountMinor,
				currency: input.currency,
				paidByUserId: input.paidByUserId,
				splitMethod: input.splitMethod,
				date: input.date,
				updatedAt: new Date(),
			})
			.where(eq(expense.id, input.expenseId));
		await tx
			.delete(expenseShare)
			.where(eq(expenseShare.expenseId, input.expenseId));
		await tx.insert(expenseShare).values(
			shares.map((share) => ({
				id: id(),
				expenseId: input.expenseId,
				userId: share.userId,
				amountMinor: share.amountMinor,
				splitInput: share.splitInput,
			})),
		);
		await recordActivity(
			tx,
			activityRow(
				current.organizationId,
				ctx.user.id,
				"expense.updated",
				"expense",
				input.expenseId,
				{
					description: input.description,
					fromAmountMinor: current.amountMinor,
					fromCurrency: current.currency,
					amountMinor: input.amountMinor,
					currency: input.currency,
				},
			),
			updatedExpenseRecipients(
				expenseRecipients(
					current.paidByUserId,
					current.amountMinor,
					current.shares,
				),
				expenseRecipients(input.paidByUserId, input.amountMinor, shares),
			),
		);
	});
	return getExpense(ctx, { expenseId });
}

export async function bulkResplitExpenses(ctx: Ctx, raw: BulkResplitInput) {
	const input = bulkResplitSchema.parse(raw);
	await membership(ctx, input.groupId);
	const successes: { expenseId: string }[] = [];
	const skips: { expenseId: string; code: string; reason: string }[] = [];
	for (const expenseId of new Set(input.expenseIds)) {
		try {
			// Check scope before taking a write lock on an expense from another group.
			const row = await ctx.db.query.expense.findFirst({
				where: and(
					eq(expense.id, expenseId),
					eq(expense.organizationId, input.groupId),
				),
			});
			if (!row)
				throw new AppError("NOT_FOUND", "Expense not found in this group");
			await changeExpense(ctx, expenseId, (current) => {
				if (current.organizationId !== input.groupId)
					throw new AppError("NOT_FOUND", "Expense not found in this group");
				return {
					expenseId,
					description: current.description,
					notes: current.notes,
					category: current.category,
					amountMinor: current.amountMinor,
					currency: current.currency,
					paidByUserId: current.paidByUserId,
					date: current.date,
					splitMethod: input.splitMethod,
					participants: input.participants,
				};
			});
			successes.push({ expenseId });
		} catch (error) {
			if (!(error instanceof AppError)) throw error;
			skips.push({ expenseId, code: error.code, reason: error.message });
		}
	}
	return { successes, skips };
}

export async function deleteExpense(ctx: Ctx, input: { expenseId: string }) {
	await ctx.db.transaction(async (tx) => {
		await lockExpense(tx, input.expenseId);
		const current = await unlockedExpense(
			{ ...ctx, db: tx as unknown as Ctx["db"] },
			input.expenseId,
		);
		await recordActivity(
			tx,
			activityRow(
				current.organizationId,
				ctx.user.id,
				"expense.deleted",
				"expense",
				current.id,
				{
					description: current.description,
					amountMinor: current.amountMinor,
					currency: current.currency,
				},
			),
			// What it meant for each of them before it was deleted.
			expenseRecipients(
				current.paidByUserId,
				current.amountMinor,
				current.shares,
			),
		);
		await tx.delete(expense).where(eq(expense.id, current.id));
	});
	return { success: true };
}

export async function setSharePaid(
	ctx: Ctx,
	input: { expenseId: string; userId: string },
	paid: boolean,
) {
	const current = await getExpense(ctx, { expenseId: input.expenseId });
	if (ctx.user.id !== input.userId && ctx.user.id !== current.paidByUserId)
		throw new AppError(
			"FORBIDDEN",
			"Only the share owner or expense payer can change this paid status",
		);
	const share = current.shares.find((row) => row.userId === input.userId);
	if (!share) throw new AppError("NOT_FOUND", "Expense share not found");
	const members = await listMembers(ctx, { groupId: current.organizationId });
	await ctx.db.transaction(async (tx) => {
		const latest = await tx.query.expense.findFirst({
			where: eq(expense.id, input.expenseId),
		});
		const latestShare = await tx.query.expenseShare.findFirst({
			where: eq(expenseShare.id, share.id),
			with: { allocations: true },
		});
		if (!latest || !latestShare)
			throw new AppError("NOT_FOUND", "Expense share not found");
		if (ctx.user.id !== input.userId && ctx.user.id !== latest.paidByUserId)
			throw new AppError(
				"FORBIDDEN",
				"Only the share owner or expense payer can change this paid status",
			);
		if (Boolean(latestShare.paidAt) === paid) return;
		const balances = await readBalances(tx, latest.organizationId, members);
		const invalid = validateSharePayment(balances.transfers, {
			fromUserId: input.userId,
			toUserId: latest.paidByUserId,
			currency: latest.currency,
			amountMinor: latestShare.amountMinor,
			paid,
			hasAllocations: latestShare.allocations.length > 0,
		});
		if (invalid) throw new AppError("VALIDATION", invalid);
		await tx
			.update(expenseShare)
			.set({
				paidAt: paid ? new Date() : null,
				paidMarkedByUserId: paid ? ctx.user.id : null,
			})
			.where(eq(expenseShare.id, share.id));
		await recordActivity(
			tx,
			activityRow(
				current.organizationId,
				ctx.user.id,
				paid ? "share.marked_paid" : "share.marked_unpaid",
				"expenseShare",
				share.id,
				{
					expenseId: current.id,
					userId: input.userId,
					paidByUserId: latest.paidByUserId,
					description: latest.description,
					amountMinor: latestShare.amountMinor,
					currency: latest.currency,
				},
			),
			people(input.userId, latest.paidByUserId),
		);
	});
	return getExpense(ctx, { expenseId: input.expenseId });
}
