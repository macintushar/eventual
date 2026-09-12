import { isCurrency } from "#/lib/currencies";
import { formatMinor } from "#/lib/money";

export type Repayment = {
	fromUserId: string;
	toUserId: string;
	currency: string;
	amountMinor: number | null;
};
type Transfer = {
	from: { userId: string };
	to: { userId: string };
	currency: string;
	amountMinor: number;
};

export function repaymentLimit(
	transfers: Transfer[],
	input: Omit<Repayment, "amountMinor">,
): number {
	return (
		transfers.find(
			(row) =>
				row.from.userId === input.fromUserId &&
				row.to.userId === input.toUserId &&
				row.currency === input.currency,
		)?.amountMinor ?? 0
	);
}

/** Same rule in the form and in the server's transaction, against fresh balances. */
export function validateRepayment(
	transfers: Transfer[],
	input: Repayment,
): string | null {
	if (!isCurrency(input.currency)) return "Choose a supported currency";
	if (!input.toUserId) return "Choose a member to repay";
	if (input.fromUserId === input.toUserId)
		return "A settlement must be between two different members";
	if (
		input.amountMinor === null ||
		!Number.isSafeInteger(input.amountMinor) ||
		input.amountMinor <= 0
	)
		return `Enter a valid positive ${input.currency} amount`;
	const limit = repaymentLimit(transfers, input);
	if (limit === 0)
		return `No ${input.currency} payment is owed to this member in the current simplified debts`;
	if (input.amountMinor > limit)
		return `You cannot pay more than the ${formatMinor(limit, input.currency)} owed to this member`;
	return null;
}

export function validateSharePayment(
	transfers: Transfer[],
	input: Repayment & { paid: boolean; hasAllocations: boolean },
): string | null {
	if (input.hasAllocations)
		return "Delete the linked settlement before changing this share's paid status";
	if (
		!input.paid ||
		input.fromUserId === input.toUserId ||
		input.amountMinor === 0
	)
		return null;
	return validateRepayment(transfers, input);
}
