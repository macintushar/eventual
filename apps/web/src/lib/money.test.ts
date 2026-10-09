import assert from "node:assert/strict";
import { test } from "node:test";
import { currencies, currencySymbol } from "#/lib/currencies";
import { formatMinor, fromMinor, parseMinor, toMinor } from "#/lib/money";
import { validateRepayment } from "#/lib/settlements";
import { computeBalances, simplifyBalances } from "#/server/domain/balances";
import { computeShares } from "#/server/domain/split";
import { createExpenseSchema, createSettlementSchema } from "#/server/schemas";

test("every supported currency has an explicit symbol used in formatting", () => {
	for (const { code } of currencies) {
		assert.ok(currencySymbol(code));
		assert.ok(formatMinor(12345, code).includes(currencySymbol(code)));
	}
	assert.equal(currencySymbol("INR"), "₹");
	assert.equal(currencySymbol("CAD"), "CA$");
	assert.equal(currencySymbol("GBP"), "£");
});

test("money respects zero, two and three decimal currencies without rounding input", () => {
	assert.equal(toMinor("200.01", "USD"), 20001);
	assert.equal(toMinor("200", "JPY"), 200);
	assert.equal(toMinor("200.001", "KWD"), 200001);
	assert.equal(parseMinor("200.001", "USD"), null);
	assert.equal(parseMinor("200.1", "JPY"), null);
	assert.equal(parseMinor("200.0001", "KWD"), null);
	assert.equal(parseMinor("-1", "USD"), null);
	assert.equal(parseMinor("NaN", "USD"), null);
	assert.equal(parseMinor("90071992547409.92", "USD"), null);
	assert.equal(toMinor("90071992547409.91", "USD"), Number.MAX_SAFE_INTEGER);
	for (const { code } of currencies) {
		assert.equal(toMinor(fromMinor(12345, code), code), 12345);
	}
});

test("splits preserve minor units and use the expense currency in errors", () => {
	const participants = ["A", "B", "C"].map((userId) => ({
		userId,
		input: null,
	}));
	assert.deepEqual(
		computeShares(100, "even", participants, "JPY").map((s) => s.amountMinor),
		[34, 33, 33],
	);
	assert.throws(
		() => computeShares(20000, "exact", [{ userId: "A", input: 10000 }], "USD"),
		/US\$/,
	);
});

test("opposite debts in different currencies never cancel", () => {
	const members = ["A", "B"].map((userId) => ({ userId, name: userId }));
	const balances = computeBalances(
		members,
		[
			{
				currency: "USD",
				paidByUserId: "B",
				shares: [{ userId: "A", amountMinor: 20000, paidAt: null }],
			},
			{
				currency: "INR",
				paidByUserId: "A",
				shares: [{ userId: "B", amountMinor: 20000, paidAt: null }],
			},
		],
		[],
	);
	const transfers = simplifyBalances(balances);
	assert.deepEqual(
		transfers.map((t) => [
			t.currency,
			t.from.userId,
			t.to.userId,
			t.amountMinor,
		]),
		[
			["INR", "B", "A", 20000],
			["USD", "A", "B", 20000],
		],
	);
	const repayment = {
		fromUserId: "A",
		toUserId: "B",
		currency: "USD",
		amountMinor: 20000,
	};
	assert.equal(validateRepayment(transfers, repayment), null);
	assert.ok(validateRepayment(transfers, { ...repayment, currency: "INR" }));
	assert.ok(validateRepayment(transfers, { ...repayment, amountMinor: 20001 }));
	assert.ok(validateRepayment(transfers, { ...repayment, amountMinor: 40000 }));
	assert.ok(validateRepayment(transfers, { ...repayment, amountMinor: 0 }));
});

test("API schemas reject unsupported currencies and require settlement currency", () => {
	const expense = {
		groupId: "G",
		description: "Dinner",
		amountMinor: 100,
		paidByUserId: "B",
		splitMethod: "even",
		date: new Date(),
		participants: [{ userId: "A", input: null }],
	};
	for (const { code } of currencies)
		assert.ok(
			createExpenseSchema.safeParse({ ...expense, currency: code }).success,
		);
	assert.equal(
		createExpenseSchema.safeParse({ ...expense, currency: "XYZ" }).success,
		false,
	);
	assert.equal(
		createExpenseSchema.safeParse({
			...expense,
			amountMinor: Number.MAX_SAFE_INTEGER + 1,
		}).success,
		false,
	);
	assert.equal(
		createSettlementSchema.safeParse({
			groupId: "G",
			toUserId: "B",
			amountMinor: 100,
		}).success,
		false,
	);
});
