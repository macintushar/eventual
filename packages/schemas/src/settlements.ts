import { isCurrency } from "./currencies";

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

/** Suggested amount only; free-form payments are not limited by balances. */
export function repaymentSuggestion(
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

/** Validate the payment shape; overpayments and either direction are allowed. */
export function validateRepayment(input: Repayment): string | null {
	if (!isCurrency(input.currency)) return "Choose a supported currency";
	if (!input.fromUserId) return "Choose who paid";
	if (!input.toUserId) return "Choose who was paid";
	if (input.fromUserId === input.toUserId)
		return "A payment must be between two different members";
	if (
		input.amountMinor === null ||
		!Number.isSafeInteger(input.amountMinor) ||
		input.amountMinor <= 0
	)
		return `Enter a valid positive ${input.currency} amount`;
	return null;
}

/** Allocated shares stay owned by their payment until that payment is deleted. */
export function validateSharePayment(input: {
	hasAllocations: boolean;
}): string | null {
	if (input.hasAllocations)
		return "Delete the linked payment before changing this share's paid status";
	return null;
}
