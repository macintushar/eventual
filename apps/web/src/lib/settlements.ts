import { isCurrency } from "@eventual/schemas/currencies";

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

/**
 * What the simplified debts currently suggest for this pair, if anything.
 * Suggestions pre-fill the form and drive UPI intents; they never gate a
 * payment.
 */
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

/**
 * Payments are free-form: any member can record money moving between any two
 * members, of any amount, in either direction — the same model Splitwise
 * uses. Paying more than is owed simply flips the debt onto the recipient.
 * Only the shape of the payment is checked here, never the group balance.
 */
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

/**
 * Marking a share paid needs no balance check either. The one integrity rule
 * left: a share paid through a settlement stays owned by that settlement, so
 * its paid status can only change by deleting the payment that paid it.
 */
export function validateSharePayment(input: {
	hasAllocations: boolean;
}): string | null {
	if (input.hasAllocations)
		return "Delete the linked payment before changing this share's paid status";
	return null;
}
