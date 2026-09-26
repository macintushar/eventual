import assert from "node:assert/strict";
import { test } from "node:test";
import { computeShares, type Participant } from "#/server/domain/split";

const participants: Participant[] = [
	{ userId: "C", input: null },
	{ userId: "A", input: null },
	{ userId: "B", input: null },
];

test("splits reject non-positive and unsafe totals", () => {
	for (const total of [0, -1]) {
		assert.throws(
			() => computeShares(total, "even", participants),
			/greater than zero/,
		);
	}
	for (const total of [1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(
			() => computeShares(total, "even", participants),
			/Total must be a safe integer/,
		);
	}
});

test("every split method requires nonempty, unique participants", () => {
	for (const method of ["even", "exact", "shares", "percent"] as const) {
		assert.throws(
			() => computeShares(100, method, []),
			/at least one participant/,
		);
		assert.throws(
			() =>
				computeShares(100, method, [
					{ userId: "A", input: 50 },
					{ userId: "A", input: 50 },
				]),
			/Participants must be unique/,
		);
	}
});

test("explicit splits reject missing, negative, fractional and unsafe inputs", () => {
	for (const method of ["exact", "shares", "percent"] as const) {
		for (const [input, error] of [
			[null, /A value is required for A/],
			[-1, /cannot be negative/],
			[0.5, /Split input must be a safe integer/],
			[NaN, /Split input must be a safe integer/],
			[Infinity, /Split input must be a safe integer/],
			[Number.MAX_SAFE_INTEGER + 1, /Split input must be a safe integer/],
		] as const) {
			assert.throws(
				() => computeShares(100, method, [{ userId: "A", input }]),
				error,
			);
		}
	}
});

test("exact and percent splits reject both under- and over-assignment", () => {
	assert.throws(
		() => computeShares(100, "exact", [{ userId: "A", input: 99 }], "JPY"),
		/¥1 left to assign/,
	);
	assert.throws(
		() => computeShares(100, "exact", [{ userId: "A", input: 101 }], "JPY"),
		/¥1 over-assigned/,
	);
	assert.throws(
		() => computeShares(100, "percent", [{ userId: "A", input: 9999 }]),
		/0\.01% left to assign/,
	);
	assert.throws(
		() => computeShares(100, "percent", [{ userId: "A", input: 10001 }]),
		/0\.01% over-assigned/,
	);
	assert.throws(
		() => computeShares(100, "shares", [{ userId: "A", input: 0 }]),
		/Total shares must be greater than zero/,
	);
});

test("weighted splits reject unsafe intermediate multiplication", () => {
	for (const method of ["shares", "percent"] as const) {
		assert.throws(
			() =>
				computeShares(Number.MAX_SAFE_INTEGER, method, [
					{ userId: "A", input: method === "percent" ? 10000 : 2 },
				]),
			/Split calculation must be a safe integer/,
		);
	}
});

test("even splits assign tiny totals by user ID and discard explicit inputs", () => {
	assert.deepEqual(
		computeShares(
			2,
			"even",
			participants.map((row) => ({ ...row, input: 99 })),
		),
		[
			{ userId: "A", amountMinor: 1, input: null, splitInput: null },
			{ userId: "B", amountMinor: 1, input: null, splitInput: null },
			{ userId: "C", amountMinor: 0, input: null, splitInput: null },
		],
	);
});

test("largest remainder outranks user order and breaks ties by user ID", () => {
	for (const [method, inputs, amounts] of [
		["shares", [1, 2, 3], [0, 1, 1]],
		["percent", [1000, 3000, 6000], [0, 1, 1]],
		["shares", [1, 1, 1], [1, 1, 0]],
		["percent", [2500, 2500, 5000], [1, 0, 1]],
	] as const) {
		const rows = inputs.map((input, index) => ({
			userId: ["A", "B", "C"][index],
			input,
		}));
		const expected = rows.map((row, index) => ({
			...row,
			splitInput: row.input,
			amountMinor: amounts[index],
		}));
		assert.deepEqual(computeShares(2, method, rows), expected);
		assert.deepEqual(computeShares(2, method, [...rows].reverse()), expected);
	}
});

test("all methods conserve minor units across tiny and large totals without mutating participants", () => {
	for (const total of [1, 2, 3, 7, 100, 10001, 1000000001]) {
		for (const method of ["even", "exact", "shares", "percent"] as const) {
			const inputs =
				method === "exact"
					? [0, 1, total - 1]
					: method === "percent"
						? [0, 3333, 6667]
						: [0, 1, 2];
			const rows = participants.map((row, index) => ({
				...row,
				input: inputs[index],
			}));
			const original = structuredClone(rows);
			const shares = computeShares(total, method, rows);
			assert.equal(
				shares.reduce((sum, row) => sum + row.amountMinor, 0),
				total,
				`${method}: ${total}`,
			);
			assert.deepEqual(
				shares.map((row) => row.userId),
				["A", "B", "C"],
			);
			for (const share of shares) {
				assert.ok(
					Number.isSafeInteger(share.amountMinor) && share.amountMinor >= 0,
				);
				const input = original.find(
					(row) => row.userId === share.userId,
				)?.input;
				assert.equal(share.splitInput, method === "even" ? null : input);
				assert.equal(share.input, share.splitInput);
				if (method === "exact") assert.equal(share.amountMinor, input);
				if (method !== "even" && input === 0)
					assert.equal(share.amountMinor, 0);
			}
			assert.deepEqual(rows, original);
		}
	}
});
