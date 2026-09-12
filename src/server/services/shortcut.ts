import type { z } from "zod";

import { formatMinor, toMinor } from "#/lib/money";
import type { Ctx } from "#/server/context";
import { AppError } from "#/server/errors";
import type { quickExpenseSchema } from "#/server/schemas";
import { createExpense, listGroups, listMembers } from "#/server/services/app";

/**
 * Apple Shortcuts' "Choose from List" shows a dictionary's keys, so these
 * endpoints return `{ label: id }`. Labels that collide fall back to a
 * disambiguated form so no row silently disappears.
 */
function labelled<T>(
	rows: T[],
	label: (row: T) => string,
	fallback: (row: T) => string,
	id: (row: T) => string,
) {
	const counts = new Map<string, number>();
	for (const row of rows)
		counts.set(label(row), (counts.get(label(row)) ?? 0) + 1);
	return Object.fromEntries(
		rows.map((row) => [
			counts.get(label(row)) === 1 ? label(row) : fallback(row),
			id(row),
		]),
	);
}

export async function shortcutGroups(ctx: Ctx) {
	const groups = await listGroups(ctx);
	return labelled(
		groups,
		(group) => group.name,
		(group) => `${group.name} (${group.slug})`,
		(group) => group.id,
	);
}

export async function shortcutMembers(ctx: Ctx, input: { groupId: string }) {
	const members = await listMembers(ctx, input);
	const me = members.filter((row) => row.userId === ctx.user.id);
	const others = members.filter((row) => row.userId !== ctx.user.id);
	return labelled(
		[...me, ...others],
		(row) => (row.userId === ctx.user.id ? `Me (${row.name})` : row.name),
		(row) => `${row.name} (${row.email})`,
		(row) => row.userId,
	);
}

export async function quickExpense(
	ctx: Ctx,
	input: z.infer<typeof quickExpenseSchema>,
) {
	let amountMinor: number;
	try {
		amountMinor = toMinor(input.amount, input.currency);
	} catch (error) {
		throw new AppError(
			"VALIDATION",
			error instanceof Error ? error.message : "Invalid amount",
		);
	}
	if (amountMinor <= 0)
		throw new AppError("VALIDATION", "Amount must be more than zero");
	const members = await listMembers(ctx, input);
	const created = await createExpense(ctx, {
		groupId: input.groupId,
		description: input.description ?? "Quick expense",
		notes: "Logged from Apple Shortcuts",
		amountMinor,
		currency: input.currency,
		paidByUserId: input.paidByUserId,
		splitMethod: "even",
		date: new Date(),
		participants: members.map((row) => ({ userId: row.userId, input: null })),
	});
	const payer =
		created.paidByUserId === ctx.user.id ? "You" : created.payer.name;
	return {
		expenseId: created.id,
		groupId: created.organizationId,
		message: `${formatMinor(amountMinor, input.currency)} logged. ${payer} paid, split evenly between ${members.length}.`,
	};
}
