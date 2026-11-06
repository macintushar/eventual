import { asc, eq, inArray, sql } from "drizzle-orm";
import { expense, member, organization, settlement, user } from "#/db/schema";
import type { Ctx } from "#/server/context";
import {
	type LedgerStep,
	type MemberBalance,
	planTransfers,
	type Transfer,
} from "#/server/domain/balances";
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
		balances: balances.get(row.organization.id)?.members ?? [],
		transfers: balances.get(row.organization.id)?.transfers ?? [],
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
	for (const { organization: group, transfers } of rows) {
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
	return (
		(
			await readGroupBalances(
				db,
				[groupId],
				members.map((row) => ({ ...row, organizationId: groupId })),
			)
		).get(groupId) ?? { members: [], transfers: [] }
	);
}

type LedgerRow = {
	organizationId: string;
	currency: string;
	bucket: number;
	kind: "debt" | "payment";
	userId: string | null;
	toUserId: string | null;
	amountMinor: number;
};

/**
 * Replays complete history in SQLite order. Expense debts between two
 * payments are summed per user in SQL, so only one row per user per gap plus
 * one row per payment crosses the wire, not every share.
 *
 * A share marked paid by hand is a debt from its expense until it was
 * marked. A recorded payment counts in full, and each of its allocations is a
 * debt between the payment's two members from the allocated share's expense
 * on, so the net matches computeBalances (unpaid shares plus unallocated
 * remainders) exactly.
 */
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
	const result = new Map<
		string,
		{ members: MemberBalance[]; transfers: Transfer[] }
	>(groupIds.map((id) => [id, { members: [], transfers: [] }]));
	if (!groupIds.length) return result;
	const rows = await db.all<LedgerRow>(sql`
		with e as (select id, organization_id, currency, paid_by_user_id, created_at from expense where ${inArray(expense.organizationId, groupIds)}),
		s as (select id, organization_id, currency, from_user_id, to_user_id, amount_minor, created_at from settlement where ${inArray(settlement.organizationId, groupIds)}),
		shares as materialized (
			select es.id, e.organization_id, e.currency, e.created_at, e.paid_by_user_id, es.user_id, es.amount_minor, es.paid_at,
				exists (select 1 from settlement_allocation a where a.expense_share_id = es.id) allocated
			from e join expense_share es on es.expense_id = e.id
			where es.user_id != e.paid_by_user_id
		),
		debts as materialized (
			select organization_id, currency, created_at t, id k, paid_by_user_id payer, user_id debtor, amount_minor amount
			from shares where paid_at is null or not allocated
			union all
			select s.organization_id, s.currency, e.created_at, a.id, s.to_user_id, s.from_user_id, a.amount_minor
			from settlement_allocation a
			join s on s.id = a.settlement_id
			join expense_share es on es.id = a.expense_share_id
			join expense e on e.id = es.expense_id
		),
		deltas as (
			select organization_id, currency, t, payer user_id, amount from debts
			union all select organization_id, currency, t, debtor, -amount from debts
			union all select organization_id, currency, created_at, null, 0 from e
		),
		events as (
			select organization_id, currency, t, 0 ord, '' k, user_id, null to_user_id, sum(amount) amount, 0 is_payment
			from deltas group by organization_id, currency, t, user_id
			union all select organization_id, currency, created_at, 1, id, from_user_id, to_user_id, amount_minor, 1 from s
			union all select organization_id, currency, paid_at, 1, id, user_id, paid_by_user_id, amount_minor, 1 from shares
				where paid_at is not null and not allocated
		),
		ordered as (
			select *, sum(is_payment) over (
				partition by organization_id, currency order by t, ord, k
				rows between unbounded preceding and current row
			) bucket from events
		)
		select organization_id as "organizationId", currency, bucket, 'payment' as kind,
			user_id as "userId", to_user_id as "toUserId", amount as "amountMinor"
		from ordered where is_payment = 1
		union all
		select organization_id, currency, bucket, 'debt', user_id, null, sum(amount)
		from ordered where is_payment = 0
		group by organization_id, currency, bucket, user_id
		order by 1, 2, 3, 4 desc
	`);
	return measureBalanceCalculation(() => {
		for (const groupId of groupIds) {
			const groupMembers = members.filter(
				(row) => row.organizationId === groupId,
			);
			const steps: LedgerStep[] = [];
			let open: Extract<LedgerStep, { kind: "debts" }> | null = null;
			for (const row of rows) {
				if (row.organizationId !== groupId) continue;
				const amount = Number(row.amountMinor);
				if (row.kind === "payment") {
					open = null;
					if (row.userId && row.toUserId && amount)
						steps.push({
							kind: "payment",
							currency: row.currency,
							fromUserId: row.userId,
							toUserId: row.toUserId,
							amountMinor: amount,
						});
					continue;
				}
				if (!open || open.currency !== row.currency) {
					open = { kind: "debts", currency: row.currency, balances: {} };
					steps.push(open);
				}
				if (!row.userId) continue;
				open.balances[row.userId] = (open.balances[row.userId] ?? 0) + amount;
			}
			const totals = new Map<string, number>();
			for (const step of steps) {
				const add = (userId: string, amount: number) => {
					const key = JSON.stringify([step.currency, userId]);
					totals.set(key, (totals.get(key) ?? 0) + amount);
				};
				if (step.kind === "payment") {
					add(step.fromUserId, step.amountMinor);
					add(step.toUserId, -step.amountMinor);
				} else
					for (const [userId, amount] of Object.entries(step.balances))
						add(userId, amount);
			}
			const currencies = [
				...new Set(steps.map((step) => step.currency)),
			].sort();
			const balances = currencies.flatMap((currency) => {
				const values = groupMembers.map(({ userId, name, image }) => ({
					userId,
					name,
					image,
					currency,
					balanceMinor: totals.get(JSON.stringify([currency, userId])) ?? 0,
				}));
				if (values.reduce((sum, row) => sum + row.balanceMinor, 0) !== 0)
					throw new Error("Group balances do not sum to zero");
				return values;
			});
			result.set(groupId, {
				members: balances,
				transfers: planTransfers(groupMembers, steps),
			});
		}
		return result;
	});
}
