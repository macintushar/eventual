import { describe, expect, test } from "bun:test";
import {
	buildRecurringInput,
	recurrences,
	storedExpense,
	tomorrow,
} from "./recurring-model";

const now = new Date(2026, 9, 12, 23, 59);
const members = [
	{ userId: "a", weight: 2 },
	{ userId: "b", weight: 1 },
];
const draft = {
	groupId: "g",
	description: " Rent ",
	amount: "10.01",
	currency: "INR",
	payer: "a",
	selected: ["a", "b"],
	recurrence: "monthly",
	date: new Date(2026, 9, 13),
};

describe("recurring creation", () => {
	test("preserves every supported schedule and local calendar day at noon", () => {
		for (const { value } of recurrences) {
			const { input } = buildRecurringInput(
				{ ...draft, recurrence: value },
				members,
				now,
			);
			expect(input.recurrence).toBe(value);
			expect(new Date(input.nextRunAt).getHours()).toBe(12);
			expect(new Date(input.nextRunAt).getDate()).toBe(13);
		}
	});
	test("converts currency precision and distributes weighted rounding exactly", () => {
		const { input, shares } = buildRecurringInput(draft, members, now);
		expect(input.payload.description).toBe("Rent");
		expect(input.payload.amountMinor).toBe(1001);
		expect(shares.map((row) => row.amountMinor)).toEqual([667, 334]);
		expect(
			buildRecurringInput(
				{ ...draft, currency: "JPY", amount: "123" },
				members,
				now,
			).input.payload.amountMinor,
		).toBe(123);
		expect(
			buildRecurringInput(
				{ ...draft, currency: "KWD", amount: "1.234" },
				members,
				now,
			).input.payload.amountMinor,
		).toBe(1234);
	});
	test("rejects invalid amounts, precision, overflow and empty split", () => {
		for (const amount of ["", "0", "-1", "1.234", "9007199254740993", "NaN"])
			expect(() =>
				buildRecurringInput({ ...draft, amount }, members, now),
			).toThrow();
		expect(() =>
			buildRecurringInput({ ...draft, selected: [] }, members, now),
		).toThrow();
		expect(() =>
			buildRecurringInput(
				{ ...draft, currency: "JPY", amount: "1.1" },
				members,
				now,
			),
		).toThrow();
	});
	test("rejects stale members, duplicates, past and invalid dates", () => {
		expect(() =>
			buildRecurringInput({ ...draft, payer: "gone" }, members, now),
		).toThrow();
		for (const selected of [["gone"], ["a", "a"]])
			expect(() =>
				buildRecurringInput({ ...draft, selected }, members, now),
			).toThrow();
		for (const date of [new Date(2026, 9, 11), new Date(Number.NaN)])
			expect(() =>
				buildRecurringInput({ ...draft, date }, members, now),
			).toThrow();
		expect(() =>
			buildRecurringInput({ ...draft, date: now }, members, now),
		).not.toThrow();
	});
	test("tomorrow handles year and leap-day rollovers without mutating input", () => {
		const end = new Date(2026, 11, 31);
		expect(tomorrow(end).getFullYear()).toBe(2027);
		expect(end.getFullYear()).toBe(2026);
		expect(tomorrow(new Date(2028, 1, 28)).getDate()).toBe(29);
	});
	test("malformed stored templates are safe to display", () => {
		for (const payload of [
			"{",
			"null",
			"{}",
			'{"expense":{"amountMinor":"bad"}}',
		])
			expect(storedExpense(payload)).toBeNull();
		const { input } = buildRecurringInput(draft, members, now);
		expect(
			storedExpense(JSON.stringify({ expense: input.payload }))?.amountMinor,
		).toBe(1001);
	});
});
