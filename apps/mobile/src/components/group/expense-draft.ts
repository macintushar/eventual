import { parseMinor } from "@eventual/schemas/money";
import type { SplitMethod } from "@eventual/schemas/split";

/** Everything the composer lets the person edit, as plain comparable values. */
export type ExpenseDraft = {
	description: string;
	notes: string;
	currency: string;
	amount: string;
	payer: string;
	/** Epoch milliseconds of the stored date. */
	date: number;
	method: SplitMethod;
	selected: Iterable<string>;
	/** Per-member split input; only read for the methods that use it. */
	inputs: Record<string, string>;
};

/** Money is compared as parsed minor units, so "12.5" equals "12.50". */
function sameAmount(a: string, b: string, currency: string) {
	if (a.trim() === b.trim()) return true;
	const left = parseMinor(a, currency);
	return left !== null && left === parseMinor(b, currency);
}

/**
 * Whether the composer holds changes worth confirming before they're thrown
 * away. Compared against what the form started with, so typing something and
 * deleting it again is not dirty, and neither is whitespace. Per-person inputs
 * are ignored under "By weight" because they aren't used there, and for people
 * who aren't selected.
 */
export function isExpenseDraftDirty(
	initial: ExpenseDraft,
	current: ExpenseDraft,
) {
	if (initial.description.trim() !== current.description.trim()) return true;
	if (initial.notes.trim() !== current.notes.trim()) return true;
	if (initial.currency !== current.currency) return true;
	if (!sameAmount(initial.amount, current.amount, current.currency))
		return true;
	if (initial.payer !== current.payer) return true;
	if (initial.date !== current.date) return true;
	if (initial.method !== current.method) return true;
	const before = [...new Set(initial.selected)].sort();
	const after = [...new Set(current.selected)].sort();
	if (before.length !== after.length) return true;
	if (before.some((userId, index) => userId !== after[index])) return true;
	if (current.method === "even") return false;
	return after.some((userId) => {
		const was = initial.inputs[userId] ?? "";
		const now = current.inputs[userId] ?? "";
		if (was.trim() === now.trim()) return false;
		if (current.method === "exact")
			return !sameAmount(was, now, current.currency);
		const left = Number(was);
		return !(was.trim() && now.trim() && left === Number(now));
	});
}
