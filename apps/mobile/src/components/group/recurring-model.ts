import { recurringExpensePayloadSchema } from "@eventual/schemas/automation";
import { atNoon } from "@eventual/schemas/dates";
import { parseMinor } from "@eventual/schemas/money";
import { computeShares } from "@eventual/schemas/split";
import type { EndpointInput } from "@eventual/sdk";

export const recurrences = [
	{ value: "daily", label: "Daily", every: "every day" },
	{ value: "weekly", label: "Weekly", every: "every week" },
	{ value: "monthly", label: "Monthly", every: "every month" },
	{ value: "yearly", label: "Yearly", every: "every year" },
] as const;
export type Recurrence = (typeof recurrences)[number]["value"];

export function tomorrow(now = new Date()) {
	const date = atNoon(now);
	date.setDate(date.getDate() + 1);
	return date;
}

/** Corrupt legacy templates remain manageable, but never display invented money. */
export function storedExpense(payload: string) {
	try {
		const result = recurringExpensePayloadSchema.safeParse(
			JSON.parse(payload)?.expense,
		);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}

type Member = { userId: string; weight: number };
export function buildRecurringInput(
	draft: {
		groupId: string;
		description: string;
		amount: string;
		currency: string;
		payer: string;
		selected: string[];
		recurrence: Recurrence;
		date: Date;
	},
	members: Member[],
	now = new Date(),
) {
	if (!draft.description.trim()) throw new Error("Add a description.");
	const amountMinor = parseMinor(draft.amount, draft.currency);
	if (amountMinor === null || amountMinor <= 0)
		throw new Error(
			`Enter a valid ${draft.currency} amount greater than zero.`,
		);
	if (!members.some((member) => member.userId === draft.payer))
		throw new Error("Choose a group member who pays.");
	if (
		draft.selected.some((id) => !members.some((member) => member.userId === id))
	)
		throw new Error("A selected person is no longer in this group.");
	if (new Set(draft.selected).size !== draft.selected.length)
		throw new Error("Choose each person only once.");
	if (
		!Number.isFinite(draft.date.getTime()) ||
		atNoon(draft.date).getTime() < atNoon(now).getTime()
	)
		throw new Error("Choose today or a later day for the first expense.");
	const participants = members
		.filter((member) => draft.selected.includes(member.userId))
		.map((member) => ({ ...member, input: null }));
	const shares = computeShares(
		amountMinor,
		"even",
		participants,
		draft.currency,
	);
	const payload = recurringExpensePayloadSchema.parse({
		description: draft.description.trim(),
		amountMinor,
		currency: draft.currency,
		paidByUserId: draft.payer,
		splitMethod: "even",
		// Preview uses current weights; the server resolves trusted group weights on each run.
		participants,
	});
	const input: EndpointInput<"recurring.create"> = {
		groupId: draft.groupId,
		recurrence: draft.recurrence,
		nextRunAt: atNoon(draft.date),
		active: true,
		payload,
	};
	return { input, shares };
}
