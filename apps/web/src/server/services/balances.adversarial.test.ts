/**
 * Adversarial service/SQL-level tests for the history-replaying "Simplified
 * debts" plan (planTransfers + readGroupBalances).
 *
 * The clock is controlled with node:test's Date mock so events can be placed
 * in the same second, in strictly increasing seconds, or backdated (clock skew
 * between server instances). Tests that encode a genuine bug are expected to
 * FAIL until the bug is fixed; each one says so in its name.
 */
import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import { repaymentSuggestion } from "#/lib/settlements";
import type { Ctx } from "#/server/context";
import {
	type BalanceMember,
	computeBalances,
	type Transfer,
} from "#/server/domain/balances";
import {
	createExpense,
	createSettlement,
	deleteExpense,
	deleteSettlement,
	getBalances,
	getCrossGroupBalances,
	setSharePaid,
	updateExpense,
} from "#/server/services/app";
import {
	crossGroupBalancesFromSummaries,
	readBalances,
	readGroupSummaries,
} from "#/server/services/balances";

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

const BASE = Date.UTC(2026, 9, 1, 12, 0, 0);

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

type World = Awaited<ReturnType<typeof world>>;

async function world(
	t: TestContext,
	userIds: string[],
	groups: Record<string, string[]>,
) {
	t.mock.timers.reset();
	t.mock.timers.enable({ apis: ["Date"], now: BASE });
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "drizzle" });
	const now = new Date();
	const users = userIds.map((id) => ({
		id,
		name: id,
		email: `${id}@test.invalid`,
		emailVerified: true,
		image: null,
		createdAt: now,
		updatedAt: now,
	}));
	await db.insert(schema.user).values(users);
	for (const [groupId, memberIds] of Object.entries(groups)) {
		await db.insert(schema.organization).values({
			id: groupId,
			name: `Group ${groupId}`,
			slug: groupId.toLowerCase(),
			createdAt: now,
		});
		await db.insert(schema.member).values(
			memberIds.map((userId) => ({
				id: `member-${groupId}-${userId}`,
				organizationId: groupId,
				userId,
				role: "owner",
				createdAt: now,
			})),
		);
	}
	const ctxFor = (userId: string): Ctx => ({
		db,
		user: users.find((u) => u.id === userId) ?? users[0],
		apiKeyId: "test",
		apiKeyPermissions: null,
		session: {
			id: "test",
			userId,
			token: "test",
			expiresAt: now,
			createdAt: now,
			updatedAt: now,
			activeOrganizationId: Object.keys(groups)[0],
			ipAddress: null,
			userAgent: null,
		},
	});
	let clockMs = BASE;
	const clock = {
		set(ms: number) {
			clockMs = ms;
			t.mock.timers.setTime(ms);
		},
		advance(seconds: number) {
			clock.set(clockMs + seconds * 1000);
		},
		get now() {
			return clockMs;
		},
	};
	const members = (groupId: string): BalanceMember[] =>
		groups[groupId]
			.map((userId) => ({ userId, name: userId, image: null }))
			.sort((a, b) => a.name.localeCompare(b.name));
	return {
		client,
		db,
		ctx: ctxFor(groups[Object.keys(groups)[0]][0]),
		ctxFor,
		clock,
		members,
		groups,
	};
}

async function addExpense(
	w: World,
	groupId: string,
	paidByUserId: string,
	owed: Record<string, number>,
	currency = "INR",
) {
	const participants = Object.entries(owed).map(([userId, input]) => ({
		userId,
		input,
	}));
	return createExpense(w.ctxFor(paidByUserId), {
		groupId,
		description: "x",
		category: null,
		amountMinor: participants.reduce((s, p) => s + p.input, 0),
		currency,
		paidByUserId,
		splitMethod: "exact",
		date: new Date(BASE),
		participants,
	});
}

async function pay(
	w: World,
	groupId: string,
	fromUserId: string,
	toUserId: string,
	amountMinor: number,
	currency = "INR",
) {
	return createSettlement(w.ctxFor(fromUserId), {
		groupId,
		fromUserId,
		toUserId,
		amountMinor,
		currency,
	});
}

async function plan(w: World, groupId: string) {
	return readBalances(w.db, groupId, w.members(groupId));
}

const rows = (transfers: Transfer[]) =>
	transfers
		.map(
			(t) => `${t.currency} ${t.from.userId}->${t.to.userId} ${t.amountMinor}`,
		)
		.sort();

/** Old (pre-fix) truth: computeBalances over raw rows. */
async function domainBalances(w: World, groupId: string) {
	const expenses = await w.db.query.expense.findMany({
		where: eq(schema.expense.organizationId, groupId),
		with: { shares: true },
	});
	const settlements = await w.db.query.settlement.findMany({
		where: eq(schema.settlement.organizationId, groupId),
		with: { allocations: true },
	});
	return computeBalances(w.members(groupId), expenses, settlements);
}

function assertSettles(
	balances: { userId: string; currency: string; balanceMinor: number }[],
	transfers: Transfer[],
	memberIds: string[],
	label: string,
) {
	const left = new Map(
		balances.map((b) => [`${b.currency}:${b.userId}`, b.balanceMinor]),
	);
	for (const t of transfers) {
		assert.ok(t.amountMinor > 0, `${label}: non-positive row ${rows([t])}`);
		assert.notEqual(t.from.userId, t.to.userId, `${label}: self row`);
		assert.ok(memberIds.includes(t.from.userId), `${label}: non-member from`);
		assert.ok(memberIds.includes(t.to.userId), `${label}: non-member to`);
		const fk = `${t.currency}:${t.from.userId}`;
		const tk = `${t.currency}:${t.to.userId}`;
		left.set(fk, (left.get(fk) ?? 0) + t.amountMinor);
		left.set(tk, (left.get(tk) ?? 0) - t.amountMinor);
	}
	for (const [key, value] of left)
		assert.equal(value, 0, `${label}: transfers leave ${key} at ${value}`);
}

async function checkInvariants(w: World, groupId: string, label: string) {
	const read = await plan(w, groupId);
	const truth = await domainBalances(w, groupId);
	assert.deepStrictEqual(read.members, truth, `${label}: balances differ`);
	assertSettles(read.members, read.transfers, w.groups[groupId], label);
	return read;
}

/** Expected plan after paying `amount` along exactly one displayed row. */
function minus(
	transfers: Transfer[],
	from: string,
	to: string,
	currency: string,
	amount: number,
) {
	const out: string[] = [];
	let done = false;
	for (const t of transfers) {
		if (
			!done &&
			t.from.userId === from &&
			t.to.userId === to &&
			t.currency === currency
		) {
			done = true;
			if (t.amountMinor - amount > 0)
				out.push(`${currency} ${from}->${to} ${t.amountMinor - amount}`);
			continue;
		}
		out.push(rows([t])[0]);
	}
	return out.sort();
}

function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let r = Math.imul(a ^ (a >>> 15), 1 | a);
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

// ---------------------------------------------------------------------------
// 1. Prod scenario end-to-end
// ---------------------------------------------------------------------------

const PROD = ["T", "R", "J", "L", "S"];

async function prodWorld(t: TestContext) {
	const w = await world(t, PROD, { G: PROD });
	await addExpense(w, "G", "S", { T: 489433, J: 216900 });
	w.clock.advance(1);
	await addExpense(w, "G", "L", { R: 472033, J: 27817 });
	w.clock.advance(1);
	return w;
}

const PROD_ROWS = [
	"INR J->L 27817",
	"INR J->S 216900",
	"INR R->L 472033",
	"INR T->S 489433",
];

test("prod: balances and original suggested rows", async (t) => {
	const w = await prodWorld(t);
	try {
		const read = await checkInvariants(w, "G", "prod");
		assert.deepEqual(
			Object.fromEntries(read.members.map((m) => [m.userId, m.balanceMinor])),
			{ J: -244717, L: 499850, R: -472033, S: 706333, T: -489433 },
		);
		assert.deepEqual(rows(read.transfers), PROD_ROWS);
	} finally {
		w.client.close();
	}
});

for (const order of [
	["J->S", "J->L", "T->S", "R->L"],
	["T->S", "R->L", "J->S", "J->L"],
	["J->L", "R->L", "J->S", "T->S"],
	["R->L", "J->S", "T->S", "J->L"],
]) {
	for (const gap of [0, 1]) {
		test(`prod: paying rows ${order.join(", ")} (${gap ? "1s apart" : "same second"}) leaves other rows intact`, async (t) => {
			const w = await prodWorld(t);
			try {
				let before = (await plan(w, "G")).transfers;
				for (const edge of order) {
					const [from, to] = edge.split("->");
					const row = before.find(
						(r) => r.from.userId === from && r.to.userId === to,
					);
					assert.ok(
						row,
						`row ${edge} vanished before it was paid: ${rows(before)}`,
					);
					const expected = minus(before, from, to, "INR", row.amountMinor);
					await pay(w, "G", from, to, row.amountMinor);
					w.clock.advance(gap);
					const after = await checkInvariants(w, "G", `after ${edge}`);
					assert.deepEqual(
						rows(after.transfers),
						expected,
						`after paying ${edge}`,
					);
					before = after.transfers;
				}
				assert.equal(before.length, 0);
			} finally {
				w.client.close();
			}
		});
	}
}

test("prod: partial payments in many pieces keep other rows intact", async (t) => {
	const w = await prodWorld(t);
	try {
		let before = (await plan(w, "G")).transfers;
		for (const piece of [100000, 16900, 50000, 50000]) {
			await pay(w, "G", "J", "S", piece);
			const after = await checkInvariants(w, "G", "partial");
			assert.deepEqual(
				rows(after.transfers),
				minus(before, "J", "S", "INR", piece),
			);
			before = after.transfers;
		}
	} finally {
		w.client.close();
	}
});

test("prod: record/delete/re-record loops (what prod users did) never move T or R", async (t) => {
	const w = await prodWorld(t);
	try {
		for (let i = 0; i < 4; i++) {
			const p = await pay(w, "G", "J", "S", 216900);
			w.clock.advance(i % 2);
			const after = await checkInvariants(w, "G", `loop ${i} recorded`);
			assert.deepEqual(
				rows(after.transfers),
				minus(
					(await (async () => PROD_ROWS)()).map((r) => {
						const [currency, edge, amount] = r.split(" ");
						const [from, to] = edge.split("->");
						return {
							currency,
							from: { userId: from, name: from },
							to: { userId: to, name: to },
							amountMinor: Number(amount),
						};
					}),
					"J",
					"S",
					"INR",
					216900,
				),
			);
			assert.ok(p);
			await deleteSettlement(w.ctx, { settlementId: p.id });
			w.clock.advance(i % 2);
			const restored = await checkInvariants(w, "G", `loop ${i} deleted`);
			assert.deepEqual(rows(restored.transfers), PROD_ROWS);
		}
		// Interleaved: record J->S, record T->S, delete J->S, re-record J->S.
		const js = await pay(w, "G", "J", "S", 216900);
		w.clock.advance(1);
		await pay(w, "G", "T", "S", 489433);
		w.clock.advance(1);
		assert.ok(js);
		await deleteSettlement(w.ctx, { settlementId: js.id });
		w.clock.advance(1);
		const mid = await checkInvariants(w, "G", "interleaved");
		assert.deepEqual(rows(mid.transfers), [
			"INR J->L 27817",
			"INR J->S 216900",
			"INR R->L 472033",
		]);
		await pay(w, "G", "J", "S", 216900);
		const end = await checkInvariants(w, "G", "re-recorded");
		assert.deepEqual(rows(end.transfers), [
			"INR J->L 27817",
			"INR R->L 472033",
		]);
	} finally {
		w.client.close();
	}
});

test("prod: marking J's share paid by hand behaves like the J->S row", async (t) => {
	const w = await prodWorld(t);
	try {
		const exp = (
			await w.db.query.expense.findMany({ with: { shares: true } })
		).find((e) => e.paidByUserId === "S");
		assert.ok(exp);
		await setSharePaid(w.ctx, { expenseId: exp.id, userId: "J" }, true);
		const after = await checkInvariants(w, "G", "manual");
		assert.deepEqual(rows(after.transfers), [
			"INR J->L 27817",
			"INR R->L 472033",
			"INR T->S 489433",
		]);
		w.clock.advance(1);
		await setSharePaid(w.ctx, { expenseId: exp.id, userId: "J" }, false);
		const back = await checkInvariants(w, "G", "manual undo");
		assert.deepEqual(rows(back.transfers), PROD_ROWS);
	} finally {
		w.client.close();
	}
});

// ---------------------------------------------------------------------------
// 2. Ordering / timestamp ties
// ---------------------------------------------------------------------------

test("ties: expense created in the same second as a settlement (expense after)", async (t) => {
	const w = await prodWorld(t);
	try {
		await pay(w, "G", "J", "S", 216900);
		// same second: an unrelated new expense
		await addExpense(w, "G", "T", { R: 1000 });
		await checkInvariants(w, "G", "same-second expense");
	} finally {
		w.client.close();
	}
});

test("ties: settlement allocating a share whose expense was created in the same second", async (t) => {
	const w = await world(t, ["A", "B", "C"], { G: ["A", "B", "C"] });
	try {
		await addExpense(w, "G", "B", { A: 500, C: 300 });
		await pay(w, "G", "A", "B", 500); // allocates A's share at the same second
		await addExpense(w, "G", "B", { A: 700 }); // same second, after
		await checkInvariants(w, "G", "same-second allocation");
		w.clock.advance(1);
		const read = await plan(w, "G");
		for (const r of read.transfers)
			assert.equal(
				fitsPlan(read.transfers, {
					fromUserId: r.from.userId,
					toUserId: r.to.userId,
					currency: r.currency,
					amountMinor: r.amountMinor,
				}),
				null,
			);
	} finally {
		w.client.close();
	}
});

test("ties: settlement then an expense backdated before it (clock skew) with an allocated share", async (t) => {
	const w = await world(t, ["A", "B", "C"], { G: ["A", "B", "C"] });
	try {
		w.clock.advance(10);
		await addExpense(w, "G", "B", { A: 500 });
		w.clock.advance(10);
		await pay(w, "G", "A", "B", 500);
		// Another instance whose clock is 15s behind records an expense whose
		// created_at is before the settlement AND before the allocated expense.
		w.clock.advance(-15);
		await addExpense(w, "G", "C", { A: 200, B: 100 });
		w.clock.advance(20);
		await checkInvariants(w, "G", "backdated");
	} finally {
		w.client.close();
	}
});

/** Make crypto.randomUUID return DESCENDING ids, so later rows sort first by `k`. */
function descendingIds(t: TestContext) {
	let n = 1e8;
	t.mock.method(
		crypto,
		"randomUUID",
		() =>
			`id-${String(n--).padStart(10, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
	);
}

/**
 * GENUINE BUG (same-second reordering). Within one second the replay orders
 * every expense before every payment (ord 0 < 1) and payments among
 * themselves by random UUID (k), not by when they were recorded. Here P1 is
 * recorded, then E4, then P2 -- all in one second. E4 is replayed before P1,
 * so P1 no longer fits and the plan is rebuilt after it; that is what is
 * displayed. P2 pays a displayed row exactly. If P2's uuid sorts before P1's
 * (50% with real v4 UUIDs; forced here), P2 is replayed against the plan
 * BEFORE P1, and C's displayed C->B 60 becomes C->B 40 + C->A 20, so "pay B
 * 60" is now rejected. Minimised from the random same-second run.
 */
test("BUG ties: P1, E, P2 in one second (P2 uuid < P1 uuid) reassigns rows nobody paid", async (t) => {
	const w = await world(t, ["A", "B", "C", "D"], { G: ["A", "B", "C", "D"] });
	descendingIds(t);
	try {
		await addExpense(w, "G", "D", { C: 51 });
		await addExpense(w, "G", "B", { D: 71 });
		await addExpense(w, "G", "A", { C: 61 });
		assert.deepEqual(rows((await plan(w, "G")).transfers), [
			"INR C->A 41",
			"INR C->B 71",
			"INR D->A 20",
		]);
		w.clock.advance(5);
		await pay(w, "G", "C", "A", 41); // P1, fits
		await addExpense(w, "G", "C", { D: 11 }); // same second
		const shown = (await plan(w, "G")).transfers;
		assert.deepEqual(rows(shown), [
			"INR C->B 60",
			"INR D->A 20",
			"INR D->B 11",
		]);
		await pay(w, "G", "D", "B", 11); // P2, same second, pays a shown row exactly
		const after = await checkInvariants(w, "G", "P1,E,P2");
		// actual: ["INR C->A 20","INR C->B 40","INR D->B 20"]
		assert.deepEqual(rows(after.transfers), ["INR C->B 60", "INR D->A 20"]);
	} finally {
		w.client.close();
	}
});

test("control: same P1, E, P2 sequence with P2 uuid > P1 uuid is stable", async (t) => {
	const w = await world(t, ["A", "B", "C", "D"], { G: ["A", "B", "C", "D"] });
	let n = 1;
	t.mock.method(
		crypto,
		"randomUUID",
		() =>
			`id-${String(n++).padStart(10, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
	);
	try {
		await addExpense(w, "G", "D", { C: 51 });
		await addExpense(w, "G", "B", { D: 71 });
		await addExpense(w, "G", "A", { C: 61 });
		w.clock.advance(5);
		await pay(w, "G", "C", "A", 41);
		await addExpense(w, "G", "C", { D: 11 });
		await pay(w, "G", "D", "B", 11);
		assert.deepEqual(rows((await checkInvariants(w, "G", "ctl")).transfers), [
			"INR C->B 60",
			"INR D->A 20",
		]);
	} finally {
		w.client.close();
	}
});

/**
 * GENUINE BUG (wall-clock ordering, clock skew). The prod scenario, but the
 * instance recording J->S has a clock 1s behind the instance that wrote the
 * last expense. The payment's created_at sorts BEFORE that expense, so the
 * replay applies it, then sees a debt step (stale) and ends with a fresh
 * greedy plan -- exactly the original prod bug: T and R get reassigned and
 * "T pays S 489433" is rejected. Needs clock skew or any backdated
 * created_at/paid_at; equal seconds alone are handled (debts sort first).
 */
test("BUG skew: payment whose created_at is 1s before the latest expense falls back to the fresh greedy plan (prod bug)", async (t) => {
	const w = await world(t, PROD, { G: PROD });
	try {
		await addExpense(w, "G", "S", { T: 489433, J: 216900 });
		w.clock.advance(1);
		await addExpense(w, "G", "L", { R: 472033, J: 27817 });
		assert.deepEqual(rows((await plan(w, "G")).transfers), PROD_ROWS);
		w.clock.advance(-1); // payment written by an instance 1s behind
		await pay(w, "G", "J", "S", 216900);
		w.clock.advance(2);
		const after = await checkInvariants(w, "G", "skew");
		// actual: T->L 489433, R->S 472033, R->L 10417, ... (fresh greedy)
		assert.deepEqual(rows(after.transfers), [
			"INR J->L 27817",
			"INR R->L 472033",
			"INR T->S 489433",
		]);
		await assert.doesNotReject(
			pay(w, "G", "T", "S", 489433),
			"T was told to pay S 489433 a moment ago",
		);
	} finally {
		w.client.close();
	}
});

// ---------------------------------------------------------------------------
// 3. Randomized histories: equivalence, settling, validation, stability
// ---------------------------------------------------------------------------

type Mode = "ascending" | "same-second" | "jitter" | "skew";

let uuidSource = rng(1);
const seededUuid = () => {
	const hex = () =>
		Math.floor(uuidSource() * 0x10000)
			.toString(16)
			.padStart(4, "0");
	return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}` as `${string}-${string}-${string}-${string}-${string}`;
};

async function randomHistory(
	t: TestContext,
	seed: number,
	mode: Mode,
	steps: number,
) {
	const random = rng(seed);
	uuidSource = rng(seed ^ 0x5eed);
	const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
	const ids = ["A", "B", "C", "D", "E"];
	const w = await world(t, ids, { G: ids, H: ["A", "B", "C"] });
	const log: string[] = [];
	const stabilityFailures: string[] = [];
	const rejectedShown: string[] = [];
	try {
		for (let step = 0; step < steps; step++) {
			if (mode === "ascending") w.clock.advance(1 + Math.floor(random() * 3));
			else if (mode === "jitter") w.clock.advance(random() < 0.5 ? 0 : 1);
			else if (mode === "skew")
				w.clock.advance(random() < 0.3 ? -2 : random() < 0.6 ? 0 : 3);
			const groupId = random() < 0.8 ? "G" : "H";
			const people = w.groups[groupId];
			const before = await checkInvariants(
				w,
				groupId,
				`seed ${seed} ${mode} step ${step} [${log.slice(-3).join(" | ")}]`,
			);
			const r = random();
			try {
				if (r < 0.35 || before.transfers.length === 0) {
					const currency = random() < 0.7 ? "INR" : "USD";
					const payer = pick(people);
					const owed: Record<string, number> = {};
					for (const p of people)
						if (random() < 0.6)
							owed[p] = random() < 0.1 ? 0 : 1 + Math.floor(random() * 50000);
					if (!Object.values(owed).some((v) => v > 0))
						owed[payer === people[0] ? people[1] : people[0]] = 1234;
					await addExpense(w, groupId, payer, owed, currency);
					log.push(`E ${payer} ${JSON.stringify(owed)} ${currency}`);
				} else if (r < 0.65) {
					const row = pick(before.transfers);
					const amount =
						random() < 0.6
							? row.amountMinor
							: 1 + Math.floor(random() * row.amountMinor);
					await pay(
						w,
						groupId,
						row.from.userId,
						row.to.userId,
						amount,
						row.currency,
					);
					log.push(
						`P ${row.from.userId}->${row.to.userId} ${amount} ${row.currency}`,
					);
					const after = await plan(w, groupId);
					const expected = minus(
						before.transfers,
						row.from.userId,
						row.to.userId,
						row.currency,
						amount,
					);
					if (
						JSON.stringify(rows(after.transfers)) !== JSON.stringify(expected)
					)
						stabilityFailures.push(
							`seed ${seed} ${mode} step ${step}: paid ${row.from.userId}->${row.to.userId} ${amount}; before ${JSON.stringify(rows(before.transfers))} expected ${JSON.stringify(expected)} got ${JSON.stringify(rows(after.transfers))}`,
						);
				} else if (r < 0.75) {
					// mark a random unpaid share paid by hand
					const exps = await w.db.query.expense.findMany({
						where: eq(schema.expense.organizationId, groupId),
						with: { shares: true },
					});
					const shares = exps.flatMap((e) =>
						e.shares
							.filter(
								(s) =>
									!s.paidAt && s.userId !== e.paidByUserId && s.amountMinor > 0,
							)
							.map((s) => ({ e, s })),
					);
					if (!shares.length) continue;
					const { e, s } = pick(shares);
					const row = before.transfers.find(
						(x) =>
							x.from.userId === s.userId &&
							x.to.userId === e.paidByUserId &&
							x.currency === e.currency,
					);
					try {
						await setSharePaid(
							w.ctx,
							{ expenseId: e.id, userId: s.userId },
							true,
						);
					} catch (error) {
						if (row && row.amountMinor >= s.amountMinor)
							rejectedShown.push(
								`seed ${seed} step ${step}: share ${s.amountMinor} rejected though row ${rows([row])} shown: ${(error as Error).message}`,
							);
						continue;
					}
					log.push(
						`M ${s.userId}->${e.paidByUserId} ${s.amountMinor} ${e.currency}`,
					);
					const after = await plan(w, groupId);
					const expected = minus(
						before.transfers,
						s.userId,
						e.paidByUserId,
						e.currency,
						s.amountMinor,
					);
					// Ticking a share is free-form now; only one that fits a shown row
					// promises to leave the other rows alone.
					if (
						row &&
						row.amountMinor >= s.amountMinor &&
						JSON.stringify(rows(after.transfers)) !== JSON.stringify(expected)
					)
						stabilityFailures.push(
							`seed ${seed} ${mode} step ${step}: marked share ${s.userId}->${e.paidByUserId} ${s.amountMinor}; expected ${JSON.stringify(expected)} got ${JSON.stringify(rows(after.transfers))}`,
						);
				} else if (r < 0.82) {
					// unmark a manually paid share
					const exps = await w.db.query.expense.findMany({
						where: eq(schema.expense.organizationId, groupId),
						with: { shares: { with: { allocations: true } } },
					});
					const shares = exps.flatMap((e) =>
						e.shares
							.filter((s) => s.paidAt && !s.allocations.length)
							.map((s) => ({ e, s })),
					);
					if (!shares.length) continue;
					const { e, s } = pick(shares);
					await setSharePaid(
						w.ctx,
						{ expenseId: e.id, userId: s.userId },
						false,
					);
					log.push(`U ${s.userId}->${e.paidByUserId}`);
				} else if (r < 0.9) {
					const ss = await w.db.query.settlement.findMany({
						where: eq(schema.settlement.organizationId, groupId),
					});
					if (!ss.length) continue;
					const s = pick(ss);
					await deleteSettlement(w.ctx, { settlementId: s.id });
					log.push(`D ${s.fromUserId}->${s.toUserId} ${s.amountMinor}`);
				} else {
					// edit or delete an unlocked expense
					const exps = await w.db.query.expense.findMany({
						where: eq(schema.expense.organizationId, groupId),
						with: { shares: true },
					});
					const open = exps.filter((e) => e.shares.every((s) => !s.paidAt));
					if (!open.length) continue;
					const e = pick(open);
					if (random() < 0.5) {
						await deleteExpense(w.ctx, { expenseId: e.id });
						log.push(`X ${e.id.slice(0, 4)}`);
					} else {
						const participants = e.shares.map((s) => ({
							userId: s.userId,
							input: s.amountMinor + Math.floor(random() * 1000),
						}));
						await updateExpense(w.ctx, {
							expenseId: e.id,
							description: "edited",
							category: null,
							amountMinor: participants.reduce((a, p) => a + p.input, 0),
							currency:
								random() < 0.2
									? e.currency === "INR"
										? "USD"
										: "INR"
									: e.currency,
							paidByUserId: pick(people),
							splitMethod: "exact",
							date: new Date(BASE),
							participants,
						});
						log.push(`ED ${e.id.slice(0, 4)}`);
					}
				}
			} catch (error) {
				throw new Error(
					`seed ${seed} ${mode} step ${step} op failed after [${log.slice(-5).join(" | ")}]: ${(error as Error).message}`,
				);
			}
			// Every displayed row must be accepted for its full amount; probe one
			// by recording + deleting it, which must restore the exact plan.
			const now = await checkInvariants(
				w,
				groupId,
				`seed ${seed} ${mode} step ${step} post`,
			);
			if (now.transfers.length && random() < 0.3) {
				const probe = pick(now.transfers);
				let created: Awaited<ReturnType<typeof pay>> | undefined;
				try {
					created = await pay(
						w,
						groupId,
						probe.from.userId,
						probe.to.userId,
						probe.amountMinor,
						probe.currency,
					);
				} catch (error) {
					rejectedShown.push(
						`seed ${seed} ${mode} step ${step}: shown row ${rows([probe])} rejected: ${(error as Error).message}`,
					);
				}
				if (created) {
					await deleteSettlement(w.ctx, { settlementId: created.id });
					const restored = await plan(w, groupId);
					if (
						JSON.stringify(rows(restored.transfers)) !==
						JSON.stringify(rows(now.transfers))
					)
						stabilityFailures.push(
							`seed ${seed} ${mode} step ${step}: record+delete probe ${rows([probe])} changed plan ${JSON.stringify(rows(now.transfers))} -> ${JSON.stringify(rows(restored.transfers))}`,
						);
				}
			}
			// Cross-group dashboard consistency.
			if (step % 10 === 9) await checkCrossGroup(w);
		}
	} finally {
		w.client.close();
	}
	return { stabilityFailures, rejectedShown };
}

async function checkCrossGroup(w: World) {
	for (const userId of ["A", "B", "C"]) {
		const ctx = w.ctxFor(userId);
		const summaries = await readGroupSummaries(ctx);
		const expected = new Map<string, number>();
		for (const s of summaries) {
			const single = await getBalances(ctx, { groupId: s.organization.id });
			assert.deepEqual(
				rows(s.transfers),
				rows(single.transfers),
				`summary transfers differ for ${s.organization.id}`,
			);
			assert.deepEqual(
				s.balances.map((b) => [b.userId, b.currency, b.balanceMinor]).sort(),
				single.members
					.map((b) => [b.userId, b.currency, b.balanceMinor])
					.sort(),
			);
			for (const t of single.transfers) {
				if (t.from.userId === userId) {
					const k = `${t.to.userId}:${t.currency}`;
					expected.set(k, (expected.get(k) ?? 0) - t.amountMinor);
				} else if (t.to.userId === userId) {
					const k = `${t.from.userId}:${t.currency}`;
					expected.set(k, (expected.get(k) ?? 0) + t.amountMinor);
				}
			}
		}
		const cross = await getCrossGroupBalances(ctx);
		assert.deepEqual(
			cross
				.map((p) => [`${p.counterpartyUserId}:${p.currency}`, p.amountMinor])
				.sort(),
			[...expected].filter(([, v]) => v !== 0).sort(),
		);
		assert.deepEqual(crossGroupBalancesFromSummaries(userId, summaries), cross);
	}
}

for (const mode of ["ascending", "jitter", "same-second", "skew"] as Mode[]) {
	test(`random histories (${mode}): balances == computeBalances, transfers settle, shown rows accepted, payments stable`, {
		// Events tied within a second, or skewed across instances, replay out of
		// recorded order; needs a per-group sequence instead of second timestamps.
		todo: mode !== "ascending" ? "ledger ordering by sequence" : false,
	}, async (t) => {
		// Deterministic UUIDs so tie-break order (k) and failures reproduce.
		t.mock.method(crypto, "randomUUID", seededUuid);
		const stability: string[] = [];
		const rejected: string[] = [];
		for (let seed = 1; seed <= 12; seed++) {
			const out = await randomHistory(t, seed * 7919 + mode.length, mode, 60);
			stability.push(...out.stabilityFailures);
			rejected.push(...out.rejectedShown);
		}
		assert.deepEqual(
			rejected,
			[],
			`shown rows rejected:\n${rejected.join("\n")}`,
		);
		assert.deepEqual(
			stability,
			[],
			`stability failures (${stability.length}):\n${stability.slice(0, 8).join("\n")}`,
		);
	});
}

// ---------------------------------------------------------------------------
// 4. Performance smell
// ---------------------------------------------------------------------------

test("perf: 5,000 expenses + 300 settlements", async (t) => {
	const ids = ["A", "B", "C", "D", "E", "F", "G1", "H"];
	const w = await world(t, ids, { G: ids });
	try {
		const random = rng(42);
		const exps = [] as (typeof schema.expense.$inferInsert)[];
		const shares = [] as (typeof schema.expenseShare.$inferInsert)[];
		for (let i = 0; i < 5000; i++) {
			const payer = ids[i % ids.length];
			const id = `E${String(i).padStart(5, "0")}`;
			exps.push({
				id,
				organizationId: "G",
				description: "x",
				amountMinor: 800 * ids.length,
				currency: i % 5 ? "INR" : "USD",
				paidByUserId: payer,
				splitMethod: "even",
				date: new Date(BASE),
				createdByUserId: payer,
				createdAt: new Date(BASE + i * 1000),
				updatedAt: new Date(BASE),
			});
			for (const u of ids)
				shares.push({
					id: `${id}-${u}`,
					expenseId: id,
					userId: u,
					amountMinor: 800,
					paidAt:
						u !== payer && random() < 0.05
							? new Date(BASE + i * 1000 + 500_000)
							: null,
				});
		}
		for (let i = 0; i < exps.length; i += 200)
			await w.db.insert(schema.expense).values(exps.slice(i, i + 200));
		for (let i = 0; i < shares.length; i += 500)
			await w.db.insert(schema.expenseShare).values(shares.slice(i, i + 500));
		const settlements = [] as (typeof schema.settlement.$inferInsert)[];
		for (let i = 0; i < 300; i++)
			settlements.push({
				id: `S${String(i).padStart(4, "0")}`,
				organizationId: "G",
				fromUserId: ids[i % ids.length],
				toUserId: ids[(i + 1) % ids.length],
				amountMinor: 100 + i,
				currency: "INR",
				createdByUserId: "A",
				createdAt: new Date(BASE + i * 16_000),
			});
		await w.db.insert(schema.settlement).values(settlements);
		const members = w.members("G");
		await readBalances(w.db, "G", members); // warm
		const times: number[] = [];
		for (let i = 0; i < 5; i++) {
			const start = performance.now();
			const r = await readBalances(w.db, "G", members);
			times.push(performance.now() - start);
			assertSettles(r.members, r.transfers, ids, "perf");
		}
		const startOld = performance.now();
		await domainBalances(w, "G");
		const old = performance.now() - startOld;
		times.sort((a, b) => a - b);
		console.log(
			`[perf] readBalances median ${times[2].toFixed(1)}ms (min ${times[0].toFixed(1)}, max ${times[4].toFixed(1)}); computeBalances via ORM ${old.toFixed(1)}ms`,
		);
		assert.deepStrictEqual(
			(await readBalances(w.db, "G", members)).members,
			await domainBalances(w, "G"),
		);
		assert.ok(times[2] < 1000, `readBalances median ${times[2]}ms`);
	} finally {
		w.client.close();
	}
});
