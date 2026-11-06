// Adversarial / property tests for planTransfers and simplifyBalances.
// Tests prefixed "BUG:" demonstrate genuine defects and are expected to fail.
// Tests prefixed "BY-DESIGN:" pin down surprising-but-intended behaviour.
import assert from "node:assert/strict";
import { test } from "node:test";
import { repaymentSuggestion } from "#/lib/settlements";
import {
	type BalanceMember,
	type LedgerStep,
	type MemberBalance,
	planTransfers,
	simplifyBalances,
	type Transfer,
} from "#/server/domain/balances";

/**
 * Payments are free-form now, so nothing rejects an off-plan payment. Stability
 * still means a shown row survives with at least the amount someone pays on it.
 */
function fitsPlan(
	transfers: Parameters<typeof repaymentSuggestion>[0],
	input: Parameters<typeof repaymentSuggestion>[1] & {
		amountMinor: number | null;
	},
): string | null {
	return input.amountMinor !== null &&
		input.amountMinor > 0 &&
		repaymentSuggestion(transfers, input) >= input.amountMinor
		? null
		: "not on the suggested plan";
}

// ---------- helpers ----------

function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
type Rng = ReturnType<typeof mulberry32>;
const int = (rng: Rng, lo: number, hi: number) =>
	lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, items: T[]) => items[int(rng, 0, items.length - 1)];

const mkMembers = (n: number): BalanceMember[] =>
	Array.from({ length: n }, (_, i) => ({
		userId: `u${String(i).padStart(2, "0")}`,
		name: `User ${i}`,
	}));

/** Random zero-sum debts step built like real expenses: one payer, several sharers. */
function randomDebts(
	rng: Rng,
	members: BalanceMember[],
	currency: string,
	opts: { maxAmount?: number; expenses?: number; ties?: boolean } = {},
): LedgerStep {
	const balances: Record<string, number> = {};
	const expenses = opts.expenses ?? int(rng, 1, 4);
	for (let e = 0; e < expenses; e++) {
		const payer = pick(rng, members).userId;
		for (const m of members) {
			if (m.userId === payer || rng() < 0.3) continue;
			const amount = opts.ties
				? pick(rng, [100, 200, 300])
				: int(rng, 1, opts.maxAmount ?? 100000);
			balances[payer] = (balances[payer] ?? 0) + amount;
			balances[m.userId] = (balances[m.userId] ?? 0) - amount;
		}
	}
	return { kind: "debts", currency, balances };
}

function net(steps: LedgerStep[]) {
	const out = new Map<string, number>();
	const add = (cur: string, userId: string, amount: number) => {
		const key = `${cur}|${userId}`;
		out.set(key, (out.get(key) ?? 0) + amount);
	};
	for (const step of steps)
		if (step.kind === "debts")
			for (const [u, a] of Object.entries(step.balances))
				add(step.currency, u, a);
		else {
			add(step.currency, step.fromUserId, step.amountMinor);
			add(step.currency, step.toUserId, -step.amountMinor);
		}
	return out;
}

/** Every structural invariant a displayed plan must satisfy. */
function assertPlanInvariants(steps: LedgerStep[], plan: Transfer[], ctx = "") {
	const balances = net(steps);
	const residual = new Map(balances);
	const seenPairs = new Set<string>();
	const payers = new Set<string>();
	const payees = new Set<string>();
	for (const row of plan) {
		const k = (u: string) => `${row.currency}|${u}`;
		assert.ok(
			Number.isSafeInteger(row.amountMinor) && row.amountMinor > 0,
			`${ctx} non-positive / non-integer amount ${row.amountMinor}`,
		);
		assert.notEqual(row.from.userId, row.to.userId, `${ctx} self edge`);
		const pair = `${row.currency}|${row.from.userId}>${row.to.userId}`;
		assert.ok(!seenPairs.has(pair), `${ctx} duplicate pair ${pair}`);
		seenPairs.add(pair);
		const reverse = `${row.currency}|${row.to.userId}>${row.from.userId}`;
		assert.ok(!seenPairs.has(reverse), `${ctx} 2-cycle ${pair}`);
		assert.ok(
			(balances.get(k(row.from.userId)) ?? 0) < 0,
			`${ctx} edge from non-debtor ${pair}`,
		);
		assert.ok(
			(balances.get(k(row.to.userId)) ?? 0) > 0,
			`${ctx} edge to non-creditor ${pair}`,
		);
		payers.add(k(row.from.userId));
		payees.add(k(row.to.userId));
		residual.set(
			k(row.from.userId),
			(residual.get(k(row.from.userId)) ?? 0) + row.amountMinor,
		);
		residual.set(
			k(row.to.userId),
			(residual.get(k(row.to.userId)) ?? 0) - row.amountMinor,
		);
	}
	for (const p of payers)
		assert.ok(!payees.has(p), `${ctx} ${p} both pays and receives`);
	for (const [key, value] of residual)
		assert.equal(
			value,
			0,
			`${ctx} plan does not settle ${key} (off by ${value})`,
		);
	// No currency may appear in the plan unless it has a non-zero balance.
	const currencies = new Set(plan.map((row) => row.currency));
	for (const cur of currencies)
		assert.ok(
			[...balances].some(([key, v]) => key.startsWith(`${cur}|`) && v !== 0),
			`${ctx} plan has rows for settled currency ${cur}`,
		);
	// Greedy-derived plans are forests: at most (#nonzero people - 1) edges per currency.
	for (const cur of currencies) {
		const nonzero = [...balances].filter(
			([key, v]) => key.startsWith(`${cur}|`) && v !== 0,
		).length;
		const edges = plan.filter((row) => row.currency === cur).length;
		assert.ok(
			edges <= nonzero - 1,
			`${ctx} ${edges} edges for ${nonzero} people`,
		);
	}
}

const key = (row: Transfer) =>
	`${row.currency}|${row.from.userId}>${row.to.userId}`;
const asMap = (plan: Transfer[]) =>
	new Map(plan.map((row) => [key(row), row.amountMinor]));

const pay = (
	currency: string,
	fromUserId: string,
	toUserId: string,
	amountMinor: number,
): LedgerStep => ({
	kind: "payment",
	currency,
	fromUserId,
	toUserId,
	amountMinor,
});

const freshPlan = (members: BalanceMember[], steps: LedgerStep[]) => {
	const balances = net(steps);
	const rows: MemberBalance[] = [];
	for (const [k, v] of balances) {
		const [currency, userId] = k.split("|");
		const m = members.find((x) => x.userId === userId);
		rows.push({ userId, name: m?.name ?? "", currency, balanceMinor: v });
	}
	return simplifyBalances(rows);
};

// ---------- real prod data ----------

const trip = [
	{ userId: "T", name: "Thillairajan" },
	{ userId: "R", name: "Ravi" },
	{ userId: "J", name: "Raji" },
	{ userId: "L", name: "Latha" },
	{ userId: "S", name: "Siva" },
];
const tripDebts: LedgerStep = {
	kind: "debts",
	currency: "INR",
	balances: { T: -489433, R: -472033, J: -244717, L: 499850, S: 706333 },
};

test("prod data: every order of paying every row in full is stable and accepted", () => {
	const base = planTransfers(trip, [tripDebts]);
	const perms = (xs: Transfer[]): Transfer[][] =>
		xs.length <= 1
			? [xs]
			: xs.flatMap((x, i) =>
					perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
				);
	for (const order of perms(base)) {
		const steps: LedgerStep[] = [tripDebts];
		let remaining = new Map(asMap(base));
		for (const row of order) {
			const plan = planTransfers(trip, steps);
			assert.deepEqual(asMap(plan), remaining);
			assert.equal(
				fitsPlan(plan, {
					fromUserId: row.from.userId,
					toUserId: row.to.userId,
					currency: "INR",
					amountMinor: row.amountMinor,
				}),
				null,
			);
			steps.push(pay("INR", row.from.userId, row.to.userId, row.amountMinor));
			remaining = new Map(remaining);
			remaining.delete(key(row));
		}
		assert.deepEqual(planTransfers(trip, steps), []);
	}
});

test("prod data: 1-paisa partial payments, one at a time, never move another row", () => {
	const steps: LedgerStep[] = [tripDebts];
	for (let i = 0; i < 50; i++) {
		const before = asMap(planTransfers(trip, steps));
		steps.push(pay("INR", "J", "L", 1));
		const after = asMap(planTransfers(trip, steps));
		for (const [k, v] of before)
			if (k !== "INR|J>L") assert.equal(after.get(k), v);
		assert.equal(after.get("INR|J>L"), (before.get("INR|J>L") ?? 0) - 1);
	}
});

// ---------- randomized stability / validity ----------

const CURRENCIES = ["INR", "USD", "JPY"];

test("fuzz: payments chosen from the displayed plan only shrink that row and are always valid", () => {
	let payments = 0;
	for (let seed = 1; seed <= 600; seed++) {
		const rng = mulberry32(seed);
		const members = mkMembers(int(rng, 2, 12));
		const steps: LedgerStep[] = [
			randomDebts(rng, members, "INR", { ties: seed % 5 === 0 }),
		];
		for (let i = 0; i < 40; i++) {
			const before = planTransfers(members, steps);
			assertPlanInvariants(steps, before, `seed ${seed} step ${i}`);
			if (!before.length) break;
			const row = pick(rng, before);
			const amount =
				rng() < 0.5 ? row.amountMinor : int(rng, 1, row.amountMinor);
			assert.equal(
				fitsPlan(before, {
					fromUserId: row.from.userId,
					toUserId: row.to.userId,
					currency: row.currency,
					amountMinor: amount,
				}),
				null,
			);
			steps.push(pay(row.currency, row.from.userId, row.to.userId, amount));
			payments++;
			const after = asMap(planTransfers(members, steps));
			const expected = asMap(before);
			if (amount === row.amountMinor) expected.delete(key(row));
			else expected.set(key(row), row.amountMinor - amount);
			assert.deepEqual(after, expected, `seed ${seed} payment ${i}`);
		}
		assert.ok(true);
	}
	assert.ok(payments > 1000);
});

test("fuzz: interleaved currencies – debts/payments in one currency never touch another currency's rows", () => {
	for (let seed = 1000; seed < 1400; seed++) {
		const rng = mulberry32(seed);
		const members = mkMembers(int(rng, 2, 10));
		const steps: LedgerStep[] = CURRENCIES.map((c) =>
			randomDebts(rng, members, c),
		);
		for (let i = 0; i < 40; i++) {
			const before = planTransfers(members, steps);
			assertPlanInvariants(steps, before, `seed ${seed} step ${i}`);
			const roll = rng();
			let touched: string;
			if (roll < 0.15 || !before.length) {
				touched = pick(rng, CURRENCIES);
				steps.push(randomDebts(rng, members, touched, { expenses: 1 }));
			} else if (roll < 0.25) {
				// legacy / off-plan payment between arbitrary members
				touched = pick(rng, CURRENCIES);
				const a = pick(rng, members).userId;
				const b = pick(
					rng,
					members.filter((m) => m.userId !== a),
				).userId;
				steps.push(pay(touched, a, b, int(rng, 1, 50000)));
			} else {
				const row = pick(rng, before);
				touched = row.currency;
				steps.push(
					pay(
						row.currency,
						row.from.userId,
						row.to.userId,
						int(rng, 1, row.amountMinor),
					),
				);
			}
			const after = planTransfers(members, steps);
			const untouched = (p: Transfer[]) =>
				p
					.filter((r) => r.currency !== touched)
					.map(key)
					.sort();
			assert.deepEqual(untouched(after), untouched(before));
			for (const r of after.filter((x) => x.currency !== touched))
				assert.equal(asMap(before).get(key(r)), r.amountMinor);
		}
	}
});

test("fuzz: arbitrary (off-plan, reverse, over-) payments and new debts keep every invariant", () => {
	for (let seed = 2000; seed < 2600; seed++) {
		const rng = mulberry32(seed);
		const members = mkMembers(int(rng, 2, 12));
		const steps: LedgerStep[] = [];
		for (let i = 0; i < 30; i++) {
			const plan = planTransfers(members, steps);
			const roll = rng();
			if (roll < 0.2) steps.push(randomDebts(rng, members, "INR"));
			else if (roll < 0.35 && plan.length) {
				const r = pick(rng, plan); // reverse direction
				steps.push(
					pay(
						"INR",
						r.to.userId,
						r.from.userId,
						int(rng, 1, 2 * r.amountMinor),
					),
				);
			} else if (roll < 0.5 && plan.length) {
				const r = pick(rng, plan); // overpay
				steps.push(
					pay(
						"INR",
						r.from.userId,
						r.to.userId,
						r.amountMinor + int(rng, 1, 1000),
					),
				);
			} else if (roll < 0.7) {
				const a = pick(rng, members).userId;
				const b = pick(
					rng,
					members.filter((m) => m.userId !== a),
				).userId;
				steps.push(pay("INR", a, b, int(rng, 1, 100000)));
			} else if (plan.length) {
				const r = pick(rng, plan);
				steps.push(
					pay("INR", r.from.userId, r.to.userId, int(rng, 1, r.amountMinor)),
				);
			}
			assertPlanInvariants(
				steps,
				planTransfers(members, steps),
				`seed ${seed} step ${i}`,
			);
		}
	}
});

test("fuzz: deleting any payment from a valid history still yields a valid plan", () => {
	let laterNowOffPlan = 0;
	let offPlanWithoutLaterDebts = 0;
	let histories = 0;
	for (let seed = 3000; seed < 3400; seed++) {
		const rng = mulberry32(seed);
		const members = mkMembers(int(rng, 3, 10));
		const steps: LedgerStep[] = [randomDebts(rng, members, "INR")];
		for (let i = 0; i < 12; i++) {
			const plan = planTransfers(members, steps);
			if (rng() < 0.2)
				steps.push(randomDebts(rng, members, "INR", { expenses: 1 }));
			else if (plan.length) {
				const r = pick(rng, plan);
				steps.push(
					pay("INR", r.from.userId, r.to.userId, int(rng, 1, r.amountMinor)),
				);
			}
		}
		const paymentIdx = steps.flatMap((s, i) =>
			s.kind === "payment" ? [i] : [],
		);
		for (const idx of paymentIdx) {
			histories++;
			const without = steps.filter((_, i) => i !== idx);
			assertPlanInvariants(
				without,
				planTransfers(members, without),
				`seed ${seed} del ${idx}`,
			);
			// Would every later payment still have been accepted against the plan it would now see?
			for (let j = idx; j < without.length; j++) {
				const s = without[j];
				if (s.kind !== "payment") continue;
				if (
					fitsPlan(planTransfers(members, without.slice(0, j)), {
						fromUserId: s.fromUserId,
						toUserId: s.toUserId,
						currency: s.currency,
						amountMinor: s.amountMinor,
					}) !== null
				) {
					laterNowOffPlan++;
					if (!without.slice(idx, j).some((x) => x.kind === "debts"))
						offPlanWithoutLaterDebts++;
				}
			}
		}
	}
	console.log(
		`[deletion] ${histories} single-payment deletions; ${laterNowOffPlan} later payments would now be off-plan (and trigger a rebuild); ${offPlanWithoutLaterDebts} of those with no expense in between`,
	);
	assert.equal(offPlanWithoutLaterDebts, 0);
});

test("quality: replayed plan vs fresh greedy transfer count", () => {
	let worse = 0;
	let better = 0;
	let maxExcess = 0;
	let worstSeed = -1;
	let total = 0;
	for (let seed = 4000; seed < 5000; seed++) {
		const rng = mulberry32(seed);
		const members = mkMembers(int(rng, 2, 12));
		const steps: LedgerStep[] = [randomDebts(rng, members, "INR")];
		for (let i = 0; i < 20; i++) {
			const plan = planTransfers(members, steps);
			if (!plan.length) break;
			const r = pick(rng, plan);
			steps.push(
				pay("INR", r.from.userId, r.to.userId, int(rng, 1, r.amountMinor)),
			);
		}
		const replay = planTransfers(members, steps).length;
		const fresh = freshPlan(members, steps).length;
		total++;
		if (replay > fresh) worse++;
		if (replay < fresh) better++;
		if (replay - fresh > maxExcess) {
			maxExcess = replay - fresh;
			worstSeed = seed;
		}
	}
	console.log(
		`[quality] ${total} groups: replay has more rows than fresh greedy in ${worse}, fewer in ${better}; max excess ${maxExcess} (seed ${worstSeed})`,
	);
	assert.ok(
		maxExcess <= 3,
		`replay plan has ${maxExcess} more rows than fresh greedy`,
	);
});

test("quality: concrete case where replay keeps more rows than fresh greedy", () => {
	// A owes 100 (→C 60, →D 40); B owes 50 → C. Paying A→C 50 leaves balances
	// A -50, B -50, C +50, D +40... computed below; just report the shapes.
	const members = mkMembers(4);
	const [A, B, C, D] = members.map((m) => m.userId);
	const steps: LedgerStep[] = [
		{
			kind: "debts",
			currency: "INR",
			balances: { [A]: -100, [B]: -60, [C]: 90, [D]: 70 },
		},
	];
	const before = planTransfers(members, steps).map(key);
	steps.push(pay("INR", A, C, 30));
	const replay = planTransfers(members, steps).map(
		(r) => `${key(r)}:${r.amountMinor}`,
	);
	const fresh = freshPlan(members, steps).map(
		(r) => `${key(r)}:${r.amountMinor}`,
	);
	console.log(
		`[quality-example] before ${before.join(", ")}\n  replay ${replay.join(", ")}\n  fresh  ${fresh.join(", ")}`,
	);
	assert.ok(replay.length >= fresh.length);
});

// ---------- edge cases ----------

test("edge: empty steps, empty members, zero-entry debts, payments with no debts", () => {
	assert.deepEqual(planTransfers([], []), []);
	assert.deepEqual(planTransfers(trip, []), []);
	assert.deepEqual(
		planTransfers(trip, [{ kind: "debts", currency: "INR", balances: {} }]),
		[],
	);
	assert.deepEqual(
		planTransfers(trip, [
			{ kind: "debts", currency: "INR", balances: { T: 0, S: 0 } },
		]),
		[],
	);
	// Payment with no debts: payer is now owed back.
	const steps = [pay("INR", "T", "S", 500)];
	const plan = planTransfers(trip, steps);
	assert.deepEqual(
		plan.map((r) => `${key(r)}:${r.amountMinor}`),
		["INR|S>T:500"],
	);
	assertPlanInvariants(steps, plan);
});

test("edge: former members (not in members list) still appear and settle", () => {
	const steps: LedgerStep[] = [
		{ kind: "debts", currency: "INR", balances: { T: -100, gone: 100 } },
	];
	const plan = planTransfers(trip, steps);
	assertPlanInvariants(steps, plan);
	assert.equal(plan[0].to.userId, "gone");
	assert.equal(plan[0].to.name, "");
	steps.push(pay("INR", "T", "gone", 40));
	assert.deepEqual(
		planTransfers(trip, steps).map((r) => r.amountMinor),
		[60],
	);
});

test("edge: equal amounts break ties by userId, and both views agree", () => {
	const members = mkMembers(4);
	const steps: LedgerStep[] = [
		{
			kind: "debts",
			currency: "INR",
			balances: { u03: -100, u02: -100, u01: 100, u00: 100 },
		},
	];
	const plan = planTransfers(members, steps).map(key);
	assert.deepEqual(plan, ["INR|u02>u00", "INR|u03>u01"]);
	assert.deepEqual(freshPlan(members, steps).map(key), plan);
});

test("edge: simplifyBalances fuzz invariants", () => {
	for (let seed = 6000; seed < 6500; seed++) {
		const rng = mulberry32(seed);
		const members = mkMembers(int(rng, 1, 12));
		const steps = CURRENCIES.map((c) =>
			randomDebts(rng, members, c, { ties: seed % 2 === 0 }),
		);
		assertPlanInvariants(steps, freshPlan(members, steps), `seed ${seed}`);
	}
});

test("edge: deleting a payment then re-recording it (record/delete churn) is idempotent", () => {
	const steps: LedgerStep[] = [tripDebts, pay("INR", "J", "S", 216900)];
	const after = planTransfers(trip, steps);
	for (let i = 0; i < 5; i++) {
		assert.deepEqual(
			planTransfers(trip, steps.slice(0, 1)),
			planTransfers(trip, [tripDebts]),
		);
		assert.deepEqual(planTransfers(trip, steps), after);
	}
});

// ---------- by-design / unreachable-input findings ----------

test("FIXED: a tiny new expense between two people leaves rows not involving them alone", () => {
	const steps: LedgerStep[] = [tripDebts, pay("INR", "J", "S", 216900)];
	const before = asMap(planTransfers(trip, steps));
	steps.push({ kind: "debts", currency: "INR", balances: { R: -1, T: 1 } });
	const after = asMap(planTransfers(trip, steps));
	const changedUninvolved = [...before.keys()].filter(
		(k) => !/[RT]>|>[RT]/.test(k) && after.get(k) !== before.get(k),
	);
	assert.deepEqual(changedUninvolved, []);
	console.log(
		`[tiny-expense] before ${JSON.stringify([...before])}\n  after ${JSON.stringify([...after])}\n  rows not involving R/T that changed: ${changedUninvolved}`,
	);
});

test("FIXED (unreachable via validateRepayment): a self-payment or zero payment is a net no-op and leaves the plan alone", () => {
	const base: LedgerStep[] = [tripDebts, pay("INR", "J", "S", 216900)];
	const before = planTransfers(trip, base).map(
		(r) => `${key(r)}:${r.amountMinor}`,
	);
	const self = planTransfers(trip, [...base, pay("INR", "T", "T", 5)]).map(
		(r) => `${key(r)}:${r.amountMinor}`,
	);
	const zero = planTransfers(trip, [...base, pay("INR", "T", "L", 0)]).map(
		(r) => `${key(r)}:${r.amountMinor}`,
	);
	console.log(
		`[noop-payment] before ${before}\n  self ${self}\n  zero ${zero}`,
	);
	assert.deepEqual(self, before);
	assert.deepEqual(zero, before);
});

test("BY-DESIGN: an expense whose net effect is exactly zero for everyone does not rebuild", () => {
	const steps: LedgerStep[] = [tripDebts, pay("INR", "J", "S", 216900)];
	const before = planTransfers(trip, steps);
	steps.push({ kind: "debts", currency: "INR", balances: { T: 0, S: 0 } });
	assert.deepEqual(planTransfers(trip, steps), before);
});

test("FIXED: two expenses that cancel out (separate debts steps) leave the plan alone", () => {
	const steps: LedgerStep[] = [tripDebts, pay("INR", "J", "S", 216900)];
	const before = planTransfers(trip, steps).map(
		(r) => `${key(r)}:${r.amountMinor}`,
	);
	steps.push(
		{ kind: "debts", currency: "INR", balances: { R: -50, T: 50 } },
		{ kind: "debts", currency: "INR", balances: { R: 50, T: -50 } },
	);
	const after = planTransfers(trip, steps).map(
		(r) => `${key(r)}:${r.amountMinor}`,
	);
	assert.deepEqual(after, before);
});

test("edge: '__proto__' as a userId in a debts Record is silently dropped (unrealistic id)", () => {
	const balances: Record<string, number> = {};
	balances.T = -100;
	balances["__proto__"] = 100; // as readGroupBalances would assign it
	const steps: LedgerStep[] = [{ kind: "debts", currency: "INR", balances }];
	// planTransfers sees only T=-100: plan cannot settle; the service's own
	// sum-to-zero check would throw first. Documented only.
	assert.deepEqual(Object.keys(balances), ["T"]);
	assert.deepEqual(planTransfers(trip, steps), []);
});
