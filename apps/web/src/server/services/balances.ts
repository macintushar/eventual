import { asc, eq, inArray, sql } from "drizzle-orm";
import { expense, member, organization, settlement, user } from "#/db/schema";
import type { Ctx } from "#/server/context";
import { type MemberBalance, simplifyBalances } from "#/server/domain/balances";
import { measureBalanceCalculation } from "#/server/performance";
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

export async function readGroupSummaries(ctx: Ctx) {
	const rows = await ctx.db
		.select({ organization, role: member.role })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, ctx.user.id))
		.orderBy(asc(organization.name));
	if (!rows.length) return [];
	const groupIds = rows.map(({ organization: group }) => group.id);
	const memberRows = await ctx.db
		.select({
			organizationId: member.organizationId,
			userId: user.id,
			name: user.name,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(inArray(member.organizationId, groupIds))
		.orderBy(asc(user.name));
	const balances = await readGroupBalances(ctx.db, groupIds, memberRows);
	return rows.map((row) => ({
		...row,
		balances: balances.get(row.organization.id) ?? [],
	}));
}

export async function getCrossGroupBalances(ctx: Ctx) {
	return crossGroupBalancesFromSummaries(
		ctx.user.id,
		await readGroupSummaries(ctx),
	);
}

export function crossGroupBalancesFromSummaries(
	userId: string,
	rows: Awaited<ReturnType<typeof readGroupSummaries>>,
) {
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
	for (const { organization: group, balances } of rows) {
		const transfers = measureBalanceCalculation(() =>
			simplifyBalances(balances),
		);
		for (const transfer of transfers) {
			// Per-group simplified transfers are the only input: if neither side
			// is the caller the third parties already netted each other out, so
			// the pair is invisible here by construction.
			if (transfer.from.userId === userId)
				push(transfer.to, transfer.currency, {
					groupId: group.id,
					groupName: group.name,
					amountMinor: -transfer.amountMinor,
				});
			else if (transfer.to.userId === userId)
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
	db: Pick<Ctx["db"], "all">,
	groupId: string,
	members: { userId: string; name: string; image?: string | null }[],
) {
	const balances =
		(
			await readGroupBalances(
				db,
				[groupId],
				members.map((row) => ({ ...row, organizationId: groupId })),
			)
		).get(groupId) ?? [];
	return {
		members: balances,
		transfers: measureBalanceCalculation(() => simplifyBalances(balances)),
	};
}

/** Aggregate complete history in SQLite; only group/user/currency totals cross the wire. */
export async function readGroupBalances(
	db: Pick<Ctx["db"], "all">,
	groupIds: string[],
	members: {
		organizationId: string;
		userId: string;
		name: string;
		image?: string | null;
	}[],
) {
	const result = new Map<string, MemberBalance[]>(
		groupIds.map((id) => [id, []]),
	);
	if (!groupIds.length) return result;
	const rows = await db.all<{
		organizationId: string;
		currency: string;
		userId: string | null;
		balanceMinor: number;
	}>(sql`
		with e as (select id, organization_id, currency, paid_by_user_id from expense where ${inArray(expense.organizationId, groupIds)}),
		s as (select id, organization_id, currency, from_user_id, to_user_id, amount_minor from settlement where ${inArray(settlement.organizationId, groupIds)}),
		unpaid as (
			select e.organization_id, e.currency, e.paid_by_user_id, es.user_id, es.amount_minor
			from e join expense_share es on es.expense_id = e.id
			where es.paid_at is null and es.user_id != e.paid_by_user_id
		),
		allocated as (
			select a.settlement_id, sum(a.amount_minor) amount from settlement_allocation a join s on s.id = a.settlement_id group by a.settlement_id
		),
		remainder as (
			select s.*, s.amount_minor - coalesce(a.amount, 0) amount from s left join allocated a on a.settlement_id = s.id
		),
		deltas as (
			select organization_id, currency, paid_by_user_id user_id, amount_minor amount from unpaid
			union all select organization_id, currency, user_id, -amount_minor from unpaid
			union all select organization_id, currency, from_user_id, amount from remainder
			union all select organization_id, currency, to_user_id, -amount from remainder
			union all select organization_id, currency, null, 0 from e
			union all select organization_id, currency, null, 0 from s
		)
		select organization_id as "organizationId", currency, user_id as "userId", sum(amount) as "balanceMinor"
		from deltas group by organization_id, currency, user_id
	`);
	return measureBalanceCalculation(() => {
		const totals = new Map(
			rows.map((row) => [
				JSON.stringify([row.organizationId, row.currency, row.userId]),
				Number(row.balanceMinor),
			]),
		);
		for (const groupId of groupIds) {
			const currencies = [
				...new Set(
					rows
						.filter((row) => row.organizationId === groupId)
						.map((row) => row.currency),
				),
			].sort();
			const groupMembers = members.filter(
				(row) => row.organizationId === groupId,
			);
			const balances = currencies.flatMap((currency) => {
				const values = groupMembers.map(({ userId, name, image }) => ({
					userId,
					name,
					image,
					currency,
					balanceMinor:
						totals.get(JSON.stringify([groupId, currency, userId])) ?? 0,
				}));
				if (values.reduce((sum, row) => sum + row.balanceMinor, 0) !== 0)
					throw new Error("Group balances do not sum to zero");
				return values;
			});
			result.set(groupId, balances);
		}
		return result;
	});
}
