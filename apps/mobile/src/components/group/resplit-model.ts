import { isCurrency } from "@eventual/schemas/currencies";
import { bulkResplitSchema } from "@eventual/schemas/expenses";
import { parseMinor } from "@eventual/schemas/money";
import { computeShares } from "@eventual/schemas/split";
import type { EndpointOutput, EventualClient } from "@eventual/sdk";

export const RESPLIT_LIMIT = 100;
export const resplitMethods = ["even", "shares", "percent"] as const;
export type ResplitMethod = (typeof resplitMethods)[number];
export type ResplitDraft = {
	method: ResplitMethod;
	memberIds: string[];
	values: Record<string, string>;
};
export type ResplitExpense = EndpointOutput<"expense.page">["items"][number];
type Group = EndpointOutput<"app.groupContext">["group"];

export function canResplit(group: Pick<Group, "myRole" | "archivedAt">) {
	return !group.archivedAt && ["owner", "admin"].includes(group.myRole);
}

export function validateSelection(groupId: string, rows: ResplitExpense[]) {
	if (!rows.length || rows.length > RESPLIT_LIMIT)
		throw new Error("Choose between 1 and 100 expenses.");
	if (new Set(rows.map((row) => row.id)).size !== rows.length)
		throw new Error("Choose each expense only once.");
	for (const row of rows) {
		if (row.organizationId !== groupId)
			throw new Error("An expense is no longer in this group.");
		if (row.locked) throw new Error(`${row.description} is now locked.`);
		if (!isCurrency(row.currency))
			throw new Error("Unsupported expense currency.");
		if (!Number.isSafeInteger(row.amountMinor) || row.amountMinor <= 0)
			throw new Error("An expense has an invalid total.");
	}
}

export function buildResplitInput<T extends ResplitExpense>(
	groupId: string,
	group: Group,
	rows: T[],
	draft: ResplitDraft,
) {
	if (!canResplit(group))
		throw new Error("Only owners and admins can re-split an active group.");
	validateSelection(groupId, rows);
	if (!resplitMethods.includes(draft.method))
		throw new Error("Exact is not supported for bulk re-split.");
	if (
		!draft.memberIds.length ||
		new Set(draft.memberIds).size !== draft.memberIds.length
	)
		throw new Error("Choose one or more unique group members.");
	const participants = draft.memberIds.map((userId) => {
		const member = group.members.find((row) => row.userId === userId);
		if (!member)
			throw new Error("A selected person is no longer in this group.");
		let input: number | null = null;
		if (draft.method !== "even") {
			const value = draft.values[userId]?.trim() ?? "";
			// Percent uses basis points, never the expense currency's precision.
			if (
				!(draft.method === "percent" ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/).test(
					value,
				)
			)
				throw new Error(
					draft.method === "percent"
						? "Enter percentages with at most 2 decimals."
						: "Enter whole-number shares.",
				);
			input =
				draft.method === "percent" ? parseMinor(value, "USD") : Number(value);
			if (input === null || !Number.isSafeInteger(input))
				throw new Error("Split input is too large.");
		}
		// Even always uses trusted group weights, not client overrides.
		return { userId, input, weight: member.weight };
	});
	const input = bulkResplitSchema.parse({
		groupId,
		expenseIds: rows.map((row) => row.id),
		splitMethod: draft.method,
		participants,
	});
	const previews = rows.map((expense) => ({
		expense,
		shares: computeShares(
			expense.amountMinor,
			draft.method,
			participants,
			expense.currency,
		),
	}));
	return { input, previews };
}

/** Ignore user profile decoration, but compare all expense state that was reviewed. */
export function expenseFingerprint(expense: EndpointOutput<"expense.get">) {
	return JSON.stringify([
		expense.id,
		expense.organizationId,
		expense.updatedAt,
		expense.description,
		expense.notes,
		expense.category,
		expense.date,
		expense.paidByUserId,
		expense.amountMinor,
		expense.currency,
		expense.splitMethod,
		expense.locked,
		[...expense.shares]
			.sort((a, b) => a.userId.localeCompare(b.userId))
			.map((share) => [
				share.userId,
				share.amountMinor,
				share.splitInput,
				share.paidAt,
				share.allocations,
			]),
	]);
}

/** Five requests at a time: never launch 200 calls for a 100-expense selection. */
async function boundedMap<T, R>(rows: T[], fn: (row: T) => Promise<R>) {
	const results: R[] = [];
	for (let i = 0; i < rows.length; i += 5)
		results.push(...(await Promise.all(rows.slice(i, i + 5).map(fn))));
	return results;
}

export async function reviewResplit(
	api: EventualClient,
	groupId: string,
	selected: ResplitExpense[],
	draft: ResplitDraft,
) {
	validateSelection(groupId, selected);
	const { group } = await api.call("app.groupContext", { groupId });
	if (!canResplit(group))
		throw new Error("Your role or this group's archive status changed.");
	const details = await boundedMap(selected, (row) =>
		api.call("expense.get", { expenseId: row.id }),
	);
	for (let i = 0; i < selected.length; i++) {
		if (
			details[i].amountMinor !== selected[i].amountMinor ||
			details[i].currency !== selected[i].currency
		)
			throw new Error(
				"An expense total changed. Reload the selection and review again.",
			);
	}
	const { input, previews } = buildResplitInput(groupId, group, details, draft);
	const checked = await boundedMap(previews, async ({ expense, shares }) => {
		const server = await api.call("expense.preview", {
			groupId,
			amountMinor: expense.amountMinor,
			currency: expense.currency,
			splitMethod: input.splitMethod,
			participants: input.participants,
		});
		if (
			JSON.stringify(server.map((row) => [row.userId, row.amountMinor])) !==
			JSON.stringify(shares.map((row) => [row.userId, row.amountMinor]))
		)
			throw new Error("Member weights changed. Review again.");
		return { expense, shares: server };
	});
	return {
		input,
		previews: checked,
		members: group.members,
		fingerprint: JSON.stringify([
			input,
			details.map(expenseFingerprint),
			checked.map((row) => row.shares),
		]),
	};
}

export type ResplitReview = Awaited<ReturnType<typeof reviewResplit>>;

export function assertReviewUnchanged(
	before: ResplitReview,
	after: ResplitReview,
) {
	if (before.fingerprint !== after.fingerprint)
		throw new Error(
			"Expenses or member weights changed. Preview again before applying.",
		);
}

/** Never treat incomplete, duplicate, or foreign result IDs as full success. */
export function resplitResultComplete(
	ids: string[],
	result: EndpointOutput<"expense.resplit">,
) {
	const reported = [...result.successes, ...result.skips].map(
		(row) => row.expenseId,
	);
	return (
		reported.length === ids.length &&
		new Set(reported).size === ids.length &&
		reported.every((id) => ids.includes(id))
	);
}
