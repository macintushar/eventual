/**
 * Who an activity involves, and what it did to each of them.
 *
 * An expense's shares are replaced on every edit and gone after a delete, so
 * "you owe ₹400" has to be worked out when the event is written — reading it
 * back later would describe the expense as it is now, not as it was then.
 */
export type Recipient = { userId: string; deltaMinor: number | null };

/**
 * One row per person on the expense: the payer and every participant.
 * `deltaMinor` is signed from that person's side — positive means they get
 * money back, negative means they owe it.
 */
export function expenseRecipients(
	paidByUserId: string,
	amountMinor: number,
	shares: { userId: string; amountMinor: number }[],
): Recipient[] {
	const deltas = new Map<string, number>([[paidByUserId, amountMinor]]);
	for (const share of shares)
		deltas.set(
			share.userId,
			(deltas.get(share.userId) ?? 0) - share.amountMinor,
		);
	return [...deltas].map(([userId, deltaMinor]) => ({ userId, deltaMinor }));
}

/**
 * An edit also reaches people it dropped. They stay on the feed with a zero
 * delta, so "you're no longer on this" is still something they get told.
 */
export function updatedExpenseRecipients(
	before: Recipient[],
	after: Recipient[],
): Recipient[] {
	const kept = new Set(after.map((row) => row.userId));
	return [
		...after,
		...before
			.filter((row) => !kept.has(row.userId))
			.map((row) => ({ userId: row.userId, deltaMinor: 0 })),
	];
}

/** Recipients with no money attached, deduplicated. */
export function people(...userIds: (string | null | undefined)[]): Recipient[] {
	return [...new Set(userIds.filter(Boolean) as string[])].map((userId) => ({
		userId,
		deltaMinor: null,
	}));
}
