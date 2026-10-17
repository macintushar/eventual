import { describe, expect, test } from "bun:test";
import { isExpenseDraftDirty } from "./expense-draft";

const noon = new Date(2026, 9, 12, 12).getTime();
const blank = {
	description: "",
	notes: "",
	currency: "INR",
	amount: "",
	payer: "me",
	date: noon,
	method: "even",
	selected: ["me", "ben"],
	inputs: {},
};
const edit = {
	...blank,
	description: "Dinner",
	amount: "1250.00",
	method: "exact",
	inputs: { me: "250.00", ben: "1000.00" },
};

describe("isExpenseDraftDirty", () => {
	test("an untouched form is clean", () => {
		expect(isExpenseDraftDirty(blank, { ...blank })).toBe(false);
		expect(isExpenseDraftDirty(edit, { ...edit })).toBe(false);
	});

	test("any edited field is dirty", () => {
		for (const change of [
			{ description: "Cab" },
			{ notes: "split later" },
			{ currency: "USD" },
			{ amount: "10" },
			{ payer: "ben" },
			{ date: noon + 86_400_000 },
			{ method: "percent" },
			{ selected: ["me"] },
		])
			expect(isExpenseDraftDirty(blank, { ...blank, ...change })).toBe(true);
	});

	test("typing and deleting again is clean", () => {
		expect(
			isExpenseDraftDirty(blank, { ...blank, description: "  ", amount: " " }),
		).toBe(false);
	});

	test("selection order and sets don't matter", () => {
		expect(
			isExpenseDraftDirty(blank, {
				...blank,
				selected: new Set(["ben", "me"]),
			}),
		).toBe(false);
	});

	test("the same amount written differently is clean", () => {
		expect(isExpenseDraftDirty(edit, { ...edit, amount: "1250" })).toBe(false);
		expect(
			isExpenseDraftDirty(edit, {
				...edit,
				inputs: { me: "250", ben: "1000.0" },
			}),
		).toBe(false);
		expect(isExpenseDraftDirty(edit, { ...edit, amount: "1251" })).toBe(true);
	});

	test("changed split inputs are dirty, unless the method doesn't use them", () => {
		const changed = { me: "300.00", ben: "950.00" };
		expect(isExpenseDraftDirty(edit, { ...edit, inputs: changed })).toBe(true);
		expect(
			isExpenseDraftDirty(
				{ ...edit, method: "even" },
				{ ...edit, method: "even", inputs: changed },
			),
		).toBe(false);
	});

	test("inputs of people who aren't selected are ignored", () => {
		const base = { ...edit, selected: ["me"], inputs: { me: "1250.00" } };
		expect(
			isExpenseDraftDirty(base, {
				...base,
				inputs: { me: "1250.00", ben: "5" },
			}),
		).toBe(false);
	});

	test("ratio and percent inputs compare numerically", () => {
		const shares = {
			...blank,
			method: "shares",
			inputs: { me: "1", ben: "2" },
		};
		expect(
			isExpenseDraftDirty(shares, {
				...shares,
				inputs: { me: "1.0", ben: "2" },
			}),
		).toBe(false);
		expect(
			isExpenseDraftDirty(shares, { ...shares, inputs: { me: "3", ben: "2" } }),
		).toBe(true);
	});
});
