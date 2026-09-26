import assert from "node:assert/strict";
import { test } from "node:test";
import { type BalanceExpense, computeBalances } from "#/server/domain/balances";

const members = [
	{ userId: "A", name: "Alice" },
	{ userId: "B", name: "Bob" },
	{ userId: "C", name: "Carol" },
	{ userId: "D", name: "Dana" },
];
const paidAt = new Date("2026-01-01T00:00:00Z");

test("an empty history has no currency balances", () => {
	assert.deepEqual(computeBalances(members, [], []), []);
	assert.deepEqual(computeBalances([], [], []), []);
});

test("only unpaid other-member shares credit the payer and debit participants", () => {
	const expenses: BalanceExpense[] = [
		{
			currency: "USD",
			paidByUserId: "A",
			shares: [
				{ userId: "A", amountMinor: 100, paidAt: null },
				{ userId: "B", amountMinor: 200, paidAt: null },
				{ userId: "C", amountMinor: 300, paidAt },
			],
		},
		{
			currency: "USD",
			paidByUserId: "B",
			shares: [{ userId: "C", amountMinor: 50, paidAt: null }],
		},
	];
	assert.deepEqual(
		computeBalances(members, expenses, []),
		members.map((member, index) => ({
			...member,
			currency: "USD",
			balanceMinor: [200, -150, -50, 0][index],
		})),
	);
});

for (const { label, amountMinor, allocations, expected } of [
	{
		label: "fully allocated",
		amountMinor: 100,
		allocations: [40, 60],
		expected: 200,
	},
	{
		label: "partially allocated",
		amountMinor: 150,
		allocations: [40, 60],
		expected: 150,
	},
	{ label: "unallocated", amountMinor: 50, allocations: [], expected: 150 },
]) {
	test(`${label} settlement counts only money not already reflected in paid shares`, () => {
		const expenses: BalanceExpense[] = [
			{ userId: "B", amountMinor: 40, paidAt },
			{ userId: "B", amountMinor: 60, paidAt },
			{ userId: "B", amountMinor: 200, paidAt: null },
		].map((share) => ({
			currency: "USD",
			paidByUserId: "A",
			shares: [share],
		}));
		const settlements = [
			{
				currency: "USD",
				fromUserId: "B",
				toUserId: "A",
				amountMinor,
				allocations: allocations.map((amountMinor) => ({ amountMinor })),
			},
		];
		const original = structuredClone({ members, expenses, settlements });
		assert.deepEqual(
			computeBalances(members, expenses, settlements).map(
				(row) => row.balanceMinor,
			),
			[expected, -expected, 0, 0],
		);
		assert.deepEqual({ members, expenses, settlements }, original);
	});
}

test("an unallocated payment to an indirect creditor closes a debt chain", () => {
	const expenses: BalanceExpense[] = [
		{
			currency: "USD",
			paidByUserId: "B",
			shares: [{ userId: "A", amountMinor: 100, paidAt: null }],
		},
		{
			currency: "USD",
			paidByUserId: "C",
			shares: [{ userId: "B", amountMinor: 100, paidAt: null }],
		},
	];
	assert.deepEqual(
		computeBalances(members, expenses, []).map((row) => row.balanceMinor),
		[-100, 0, 100, 0],
	);
	assert.deepEqual(
		computeBalances(members, expenses, [
			{
				currency: "USD",
				fromUserId: "A",
				toUserId: "C",
				amountMinor: 100,
				allocations: [],
			},
		]).map((row) => row.balanceMinor),
		[0, 0, 0, 0],
	);
});

test("mixed histories conserve each currency independently, including settlement-only currencies", () => {
	const balances = computeBalances(
		members,
		[
			{
				currency: "USD",
				paidByUserId: "A",
				shares: [
					{ userId: "B", amountMinor: 100, paidAt: null },
					{ userId: "C", amountMinor: 30, paidAt },
				],
			},
			{
				currency: "INR",
				paidByUserId: "B",
				shares: [{ userId: "A", amountMinor: 100, paidAt: null }],
			},
		],
		[
			{
				currency: "USD",
				fromUserId: "C",
				toUserId: "A",
				amountMinor: 30,
				allocations: [{ amountMinor: 30 }],
			},
			{
				currency: "USD",
				fromUserId: "B",
				toUserId: "A",
				amountMinor: 25,
				allocations: [],
			},
			{
				currency: "JPY",
				fromUserId: "C",
				toUserId: "B",
				amountMinor: 7,
				allocations: [],
			},
		],
	);
	assert.deepEqual(
		balances,
		[
			{ currency: "INR", amounts: [-100, 100, 0, 0] },
			{ currency: "JPY", amounts: [0, -7, 7, 0] },
			{ currency: "USD", amounts: [75, -75, 0, 0] },
		].flatMap(({ currency, amounts }) =>
			members.map((member, index) => ({
				...member,
				currency,
				balanceMinor: amounts[index],
			})),
		),
	);
	for (const currency of ["INR", "JPY", "USD"]) {
		assert.equal(
			balances
				.filter((row) => row.currency === currency)
				.reduce((sum, row) => sum + row.balanceMinor, 0),
			0,
			currency,
		);
	}
});

test("unbalanced member projections fail even when missing debts cancel across currencies", () => {
	assert.throws(
		() =>
			computeBalances(
				members,
				[
					{
						currency: "USD",
						paidByUserId: "A",
						shares: [{ userId: "missing", amountMinor: 100, paidAt: null }],
					},
					{
						currency: "INR",
						paidByUserId: "missing",
						shares: [{ userId: "A", amountMinor: 100, paidAt: null }],
					},
				],
				[],
			),
		/Group balances do not sum to zero/,
	);
});
