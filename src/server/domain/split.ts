import { formatMinor } from "#/lib/money";

export type SplitMethod = "even" | "exact" | "shares" | "percent";
export type Participant = { userId: string; input: number | null };
export type ComputedShare = Participant & {
	amountMinor: number;
	splitInput: number | null;
};

function assertInteger(value: number, label: string) {
	if (!Number.isSafeInteger(value))
		throw new Error(`${label} must be a safe integer`);
}

function distribute(
	totalMinor: number,
	values: { userId: string; input: number }[],
	divisor: number,
) {
	const rows = values.map((participant, index) => {
		const product = totalMinor * participant.input;
		assertInteger(product, "Split calculation");
		return {
			...participant,
			index,
			amountMinor: Math.floor(product / divisor),
			remainder: product % divisor,
		};
	});
	let leftover =
		totalMinor - rows.reduce((sum, row) => sum + row.amountMinor, 0);
	for (const row of [...rows].sort(
		(a, b) => b.remainder - a.remainder || a.index - b.index,
	)) {
		if (leftover-- <= 0) break;
		row.amountMinor++;
	}
	return rows
		.sort((a, b) => a.index - b.index)
		.map(({ userId, input, amountMinor }) => ({
			userId,
			amountMinor,
			splitInput: input,
		}));
}

export function computeShares(
	totalMinor: number,
	method: SplitMethod,
	participants: Participant[],
	currency = "INR",
): ComputedShare[] {
	assertInteger(totalMinor, "Total");
	if (totalMinor <= 0) throw new Error("Total must be greater than zero");
	if (participants.length === 0)
		throw new Error("Choose at least one participant");
	const sorted = [...participants].sort((a, b) =>
		a.userId.localeCompare(b.userId),
	);
	if (new Set(sorted.map((row) => row.userId)).size !== sorted.length)
		throw new Error("Participants must be unique");
	let result: ComputedShare[];
	if (method === "even") {
		const base = Math.floor(totalMinor / sorted.length);
		const remainder = totalMinor - base * sorted.length;
		result = sorted.map((row, index) => ({
			userId: row.userId,
			amountMinor: base + (index < remainder ? 1 : 0),
			splitInput: null,
			input: null,
		}));
	} else {
		const values = sorted.map(({ userId, input }) => {
			if (input === null) throw new Error(`A value is required for ${userId}`);
			assertInteger(input, "Split input");
			if (input < 0) throw new Error("Split inputs cannot be negative");
			return { userId, input };
		});
		const sum = values.reduce((total, row) => total + row.input, 0);
		if (method === "exact") {
			if (sum !== totalMinor) {
				const delta = totalMinor - sum;
				throw new Error(
					delta > 0
						? `${formatMinor(delta, currency)} left to assign`
						: `${formatMinor(-delta, currency)} over-assigned`,
				);
			}
			result = values.map((row) => ({
				...row,
				amountMinor: row.input,
				splitInput: row.input,
			}));
		} else if (method === "percent") {
			if (sum !== 10000)
				throw new Error(
					`${Math.abs(10000 - sum) / 100}% ${sum < 10000 ? "left to assign" : "over-assigned"}`,
				);
			result = distribute(totalMinor, values, 10000).map((row) => ({
				...row,
				input: row.splitInput,
			}));
		} else {
			if (sum <= 0) throw new Error("Total shares must be greater than zero");
			result = distribute(totalMinor, values, sum).map((row) => ({
				...row,
				input: row.splitInput,
			}));
		}
	}
	if (result.reduce((sum, row) => sum + row.amountMinor, 0) !== totalMinor)
		throw new Error("Computed shares do not equal the expense total");
	return result;
}
