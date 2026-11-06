export type BalanceMember = {
	userId: string;
	name: string;
	/** A photo URL, or null when the member has not set one. */
	image?: string | null;
};
export type BalanceExpense = {
	currency: string;
	paidByUserId: string;
	shares: { userId: string; amountMinor: number; paidAt: Date | null }[];
};
export type BalanceSettlement = {
	currency: string;
	fromUserId: string;
	toUserId: string;
	amountMinor: number;
	allocations: { amountMinor: number }[];
};
export type MemberBalance = BalanceMember & {
	currency: string;
	balanceMinor: number;
};

export function computeBalances(
	members: BalanceMember[],
	expenses: BalanceExpense[],
	settlements: BalanceSettlement[],
): MemberBalance[] {
	const currencies = [
		...new Set([...expenses, ...settlements].map((row) => row.currency)),
	].sort();
	return currencies.flatMap((currency) =>
		computeCurrencyBalances(
			members,
			expenses.filter((row) => row.currency === currency),
			settlements.filter((row) => row.currency === currency),
			currency,
		),
	);
}

function computeCurrencyBalances(
	members: BalanceMember[],
	expenses: BalanceExpense[],
	settlements: BalanceSettlement[],
	currency: string,
): MemberBalance[] {
	const balances = new Map(members.map((member) => [member.userId, 0]));
	for (const expense of expenses) {
		for (const share of expense.shares) {
			if (share.paidAt || share.userId === expense.paidByUserId) continue;
			balances.set(
				expense.paidByUserId,
				(balances.get(expense.paidByUserId) ?? 0) + share.amountMinor,
			);
			balances.set(
				share.userId,
				(balances.get(share.userId) ?? 0) - share.amountMinor,
			);
		}
	}
	for (const settlement of settlements) {
		// The allocated portion already moved the balance by marking those shares
		// paid, so only the unallocated remainder counts here. Counting the raw
		// amount as well would double-count a settlement against its own shares.
		const unallocated =
			settlement.amountMinor -
			settlement.allocations.reduce((sum, row) => sum + row.amountMinor, 0);
		if (unallocated === 0) continue;
		balances.set(
			settlement.fromUserId,
			(balances.get(settlement.fromUserId) ?? 0) + unallocated,
		);
		balances.set(
			settlement.toUserId,
			(balances.get(settlement.toUserId) ?? 0) - unallocated,
		);
	}
	const result = members.map((member) => ({
		...member,
		currency,
		balanceMinor: balances.get(member.userId) ?? 0,
	}));
	if (result.reduce((sum, row) => sum + row.balanceMinor, 0) !== 0)
		throw new Error("Group balances do not sum to zero");
	return result;
}

export type Transfer = {
	from: BalanceMember;
	to: BalanceMember;
	amountMinor: number;
	currency: string;
};

/**
 * One chronological step of a group's history in one currency: either the net
 * effect of a run of expenses (`debts`, per user) or one payment.
 */
export type LedgerStep =
	| { kind: "debts"; currency: string; balances: Record<string, number> }
	| {
			kind: "payment";
			currency: string;
			fromUserId: string;
			toUserId: string;
			amountMinor: number;
	  };

/** Fresh greedy plan for the given net balances, ignoring history. */
export function simplifyBalances(balances: MemberBalance[]): Transfer[] {
	return [...new Set(balances.map((row) => row.currency))]
		.sort()
		.flatMap((currency) => {
			const rows = balances.filter((row) => row.currency === currency);
			return named(
				greedyPlan(new Map(rows.map((row) => [row.userId, row.balanceMinor]))),
				new Map(rows.map((row) => [row.userId, row])),
				currency,
			);
		});
}

/**
 * The suggested repayments after replaying a group's history.
 *
 * A fresh greedy plan for the current balances is not stable: paying one
 * suggested row exactly can change which creditor is largest and reassign
 * everyone else's rows, and validateRepayment then rejects a payment someone
 * was told to make a moment ago. Instead the plan is only rebuilt when debts
 * change (an expense) or when a payment does not fit it; a payment along a
 * suggested row just shrinks that row and leaves every other row alone.
 * When debts change, or a payment does not fit, the existing plan is
 * repaired rather than replaced, so rows that still make sense survive.
 *
 * Final balances are the sum of every step, so the returned plan always
 * settles them exactly.
 */
export function planTransfers(
	members: BalanceMember[],
	steps: LedgerStep[],
): Transfer[] {
	const byId = new Map(members.map((member) => [member.userId, member]));
	return [...new Set(steps.map((step) => step.currency))]
		.sort()
		.flatMap((currency) => {
			const balances = new Map<string, number>(
				members.map((member) => [member.userId, 0]),
			);
			const add = (userId: string, amount: number) =>
				balances.set(userId, (balances.get(userId) ?? 0) + amount);
			let plan: Edge[] = [];
			let stale = false;
			for (const step of steps) {
				if (step.currency !== currency) continue;
				if (step.kind === "debts") {
					for (const [userId, amount] of Object.entries(step.balances))
						if (amount) {
							add(userId, amount);
							stale = true;
						}
					continue;
				}
				if (stale) {
					plan = repairPlan(plan, balances);
					stale = false;
				}
				add(step.fromUserId, step.amountMinor);
				add(step.toUserId, -step.amountMinor);
				const edge = plan.find(
					(row) => row.from === step.fromUserId && row.to === step.toUserId,
				);
				if (edge && edge.amountMinor >= step.amountMinor) {
					edge.amountMinor -= step.amountMinor;
					if (!edge.amountMinor) plan = plan.filter((row) => row !== edge);
				} else stale = true;
			}
			if (stale) plan = repairPlan(plan, balances);
			return named(plan, byId, currency);
		});
}

type Edge = { from: string; to: string; amountMinor: number };

function named(
	plan: Edge[],
	byId: Map<string, BalanceMember>,
	currency: string,
): Transfer[] {
	const person = (userId: string) => {
		const member = byId.get(userId);
		return { userId, name: member?.name ?? "" };
	};
	return plan.map((edge) => ({
		currency,
		from: person(edge.from),
		to: person(edge.to),
		amountMinor: edge.amountMinor,
	}));
}

/**
 * Keeps as much of `plan` as still fits `balances`: rows whose ends are no
 * longer a debtor and a creditor go, rows that now move too much shrink
 * (newest first), and only what is left over is matched greedily. With an
 * empty plan this is the plain greedy plan.
 *
 * Repairs can fragment, so a repaired plan that needs more payments than
 * people with a balance minus one (what greedy never exceeds) is dropped for a
 * fresh greedy plan: stability is not worth asking people to pay more often.
 */
function repairPlan(previous: Edge[], balances: Map<string, number>): Edge[] {
	const plan = previous
		.filter(
			(edge) =>
				(balances.get(edge.from) ?? 0) < 0 && (balances.get(edge.to) ?? 0) > 0,
		)
		.map((edge) => ({ ...edge }));
	const trim = (side: "from" | "to", limit: (userId: string) => number) => {
		const moved = new Map<string, number>();
		for (const edge of plan)
			moved.set(edge[side], (moved.get(edge[side]) ?? 0) + edge.amountMinor);
		for (const edge of [...plan].reverse()) {
			let excess = (moved.get(edge[side]) ?? 0) - limit(edge[side]);
			if (excess <= 0) continue;
			const cut = Math.min(excess, edge.amountMinor);
			edge.amountMinor -= cut;
			excess -= cut;
			moved.set(edge[side], limit(edge[side]) + excess);
		}
	};
	trim("from", (userId) => -(balances.get(userId) ?? 0));
	trim("to", (userId) => balances.get(userId) ?? 0);
	const kept = plan.filter((edge) => edge.amountMinor > 0);
	const residual = new Map(balances);
	for (const edge of kept) {
		residual.set(edge.from, (residual.get(edge.from) ?? 0) + edge.amountMinor);
		residual.set(edge.to, (residual.get(edge.to) ?? 0) - edge.amountMinor);
	}
	for (const edge of greedyPlan(residual)) {
		const same = kept.find(
			(row) => row.from === edge.from && row.to === edge.to,
		);
		if (same) same.amountMinor += edge.amountMinor;
		else kept.push(edge);
	}
	const open = [...balances.values()].filter((balance) => balance !== 0);
	return kept.length <= Math.max(open.length - 1, 0)
		? kept
		: greedyPlan(balances);
}

function greedyPlan(balances: Map<string, number>): Edge[] {
	const people = [...balances];
	const debtors = people
		.filter(([, balance]) => balance < 0)
		.map(([userId, balance]) => ({ userId, remaining: -balance }));
	const creditors = people
		.filter(([, balance]) => balance > 0)
		.map(([userId, balance]) => ({ userId, remaining: balance }));
	const plan: Edge[] = [];
	const order = (
		a: { userId: string; remaining: number },
		b: { userId: string; remaining: number },
	) => b.remaining - a.remaining || a.userId.localeCompare(b.userId);
	while (debtors.length && creditors.length) {
		debtors.sort(order);
		creditors.sort(order);
		const debtor = debtors[0];
		const creditor = creditors[0];
		const amountMinor = Math.min(debtor.remaining, creditor.remaining);
		plan.push({ from: debtor.userId, to: creditor.userId, amountMinor });
		debtor.remaining -= amountMinor;
		creditor.remaining -= amountMinor;
		if (debtor.remaining === 0) debtors.shift();
		if (creditor.remaining === 0) creditors.shift();
	}
	return plan;
}
