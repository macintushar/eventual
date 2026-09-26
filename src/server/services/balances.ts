import { asc, eq, inArray } from "drizzle-orm";
import { expense, member, organization, settlement, user } from "#/db/schema";
import type { Ctx } from "#/server/context";
import { computeBalances, simplifyBalances } from "#/server/domain/balances";
import { membership } from "./shared";

export async function getBalances(ctx: Ctx, input: { groupId: string }) {
	await membership(ctx, input.groupId);
	const members = await ctx.db
		.select({
			id: member.id,
			userId: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			role: member.role,
			createdAt: member.createdAt,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(eq(member.organizationId, input.groupId))
		.orderBy(asc(user.name));
	return readBalances(ctx.db, input.groupId, members);
}

export async function getCrossGroupBalances(ctx: Ctx) {
	const rows = await ctx.db
		.select({ organization, role: member.role })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, ctx.user.id))
		.orderBy(asc(organization.name));
	if (!rows.length) return [];
	const groupIds = rows.map(({ organization: group }) => group.id);
	const [memberRows, expenses, settlements] = await Promise.all([
		ctx.db
			.select({
				organizationId: member.organizationId,
				userId: user.id,
				name: user.name,
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(inArray(member.organizationId, groupIds))
			.orderBy(asc(user.name)),
		ctx.db.query.expense.findMany({
			where: inArray(expense.organizationId, groupIds),
			with: { shares: true },
		}),
		ctx.db.query.settlement.findMany({
			where: inArray(settlement.organizationId, groupIds),
			with: { allocations: true },
		}),
	]);
	const byGroup = <Row extends { organizationId: string }>(list: Row[]) => {
		const map = new Map(groupIds.map((groupId) => [groupId, [] as Row[]]));
		for (const row of list) map.get(row.organizationId)?.push(row);
		return map;
	};
	const membersByGroup = byGroup(memberRows);
	const expensesByGroup = byGroup(expenses);
	const settlementsByGroup = byGroup(settlements);
	type Contribution = {
		groupId: string;
		groupName: string;
		amountMinor: number;
	};
	type Pair = {
		counterpartyUserId: string;
		counterpartyName: string;
		currency: string;
		amountMinor: number;
		groups: Contribution[];
	};
	const pairs = new Map<string, Pair>();
	const push = (
		counterparty: { userId: string; name: string },
		currency: string,
		contribution: Contribution,
	) => {
		const key = `${counterparty.userId}:${currency}`;
		const pair = pairs.get(key) ?? {
			counterpartyUserId: counterparty.userId,
			counterpartyName: counterparty.name,
			currency,
			amountMinor: 0,
			groups: [],
		};
		if (!pair.groups.some((row) => row.groupId === contribution.groupId))
			pair.groups.push(contribution);
		pair.amountMinor += contribution.amountMinor;
		pairs.set(key, pair);
	};
	for (const { organization: group } of rows) {
		const transfers = simplifyBalances(
			computeBalances(
				membersByGroup.get(group.id) ?? [],
				expensesByGroup.get(group.id) ?? [],
				settlementsByGroup.get(group.id) ?? [],
			),
		);
		for (const transfer of transfers) {
			// Per-group simplified transfers are the only input: if neither side
			// is the caller the third parties already netted each other out, so
			// the pair is invisible here by construction.
			if (transfer.from.userId === ctx.user.id)
				push(transfer.to, transfer.currency, {
					groupId: group.id,
					groupName: group.name,
					amountMinor: -transfer.amountMinor,
				});
			else if (transfer.to.userId === ctx.user.id)
				push(transfer.from, transfer.currency, {
					groupId: group.id,
					groupName: group.name,
					amountMinor: transfer.amountMinor,
				});
		}
	}
	return [...pairs.values()]
		.filter((pair) => pair.amountMinor !== 0)
		.sort(
			(a, b) =>
				a.counterpartyName.localeCompare(b.counterpartyName) ||
				a.currency.localeCompare(b.currency),
		);
}

export async function readBalances(
	db: Pick<Ctx["db"], "query">,
	groupId: string,
	members: { userId: string; name: string }[],
) {
	const expenses = await db.query.expense.findMany({
		where: eq(expense.organizationId, groupId),
		with: { shares: true },
	});
	const settlements = await db.query.settlement.findMany({
		where: eq(settlement.organizationId, groupId),
		with: { allocations: true },
	});
	const balances = computeBalances(
		members.map((row) => ({ userId: row.userId, name: row.name })),
		expenses,
		settlements,
	);
	return { members: balances, transfers: simplifyBalances(balances) };
}
