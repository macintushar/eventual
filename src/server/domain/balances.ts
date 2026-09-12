export type BalanceMember = { userId: string; name: string };
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

export function simplifyBalances(balances: MemberBalance[]) {
	return [...new Set(balances.map((row) => row.currency))]
		.sort()
		.flatMap((currency) =>
			simplifyCurrencyBalances(
				balances.filter((row) => row.currency === currency),
				currency,
			),
		);
}

function simplifyCurrencyBalances(balances: MemberBalance[], currency: string) {
	const debtors = balances
		.filter((row) => row.balanceMinor < 0)
		.map((row) => ({ ...row, remaining: -row.balanceMinor }));
	const creditors = balances
		.filter((row) => row.balanceMinor > 0)
		.map((row) => ({ ...row, remaining: row.balanceMinor }));
	const transfers: {
		from: BalanceMember;
		to: BalanceMember;
		amountMinor: number;
		currency: string;
	}[] = [];
	while (debtors.length && creditors.length) {
		debtors.sort(
			(a, b) => b.remaining - a.remaining || a.userId.localeCompare(b.userId),
		);
		creditors.sort(
			(a, b) => b.remaining - a.remaining || a.userId.localeCompare(b.userId),
		);
		const debtor = debtors[0];
		const creditor = creditors[0];
		const amountMinor = Math.min(debtor.remaining, creditor.remaining);
		transfers.push({
			currency,
			from: { userId: debtor.userId, name: debtor.name },
			to: { userId: creditor.userId, name: creditor.name },
			amountMinor,
		});
		debtor.remaining -= amountMinor;
		creditor.remaining -= amountMinor;
		if (debtor.remaining === 0) debtors.shift();
		if (creditor.remaining === 0) creditors.shift();
	}
	return transfers;
}
