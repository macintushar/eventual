/**
 * Adversarial user journeys against the replayed "Simplified debts" plan.
 *
 * The group is shaped like the "Hassanamba temple visit" incident: seven
 * people, a few big expenses paid by Siva and Latha and split unevenly, then
 * Abhiramasundari pays Latha ₹4,351.17 and Ravikumar pays Siva ₹4,894.36.
 *
 * Tests that document a design trade-off pass and log what they measured;
 * tests for behaviour that looks like a genuine bug are left failing.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import {
	createExpense,
	createSettlement,
	deleteExpense,
	deleteSettlement,
	getBalances,
	getExpense,
	leaveGroup,
	removeMember,
	setSharePaid,
} from "#/server/services/app";

const NAMES: Record<string, string> = {
	RK: "Ravikumar",
	T: "Thillairajan",
	L: "Latha",
	RJ: "Raji",
	A: "Abhiramasundari",
	RV: "Ravi",
	S: "Siva",
};

/** Plan right after deploy: replayed from when the first payment was recorded. */
const INITIAL_PLAN = ["T>L:489433", "RV>S:472033", "RJ>S:234300", "RJ>L:10417"];

function exact(shares: Record<string, number>) {
	return Object.entries(shares).map(([userId, input]) => ({ userId, input }));
}

async function group({ settle = true } = {}) {
	// Every action happens one second after the previous one unless a test
	// deliberately keeps the clock still; timestamps are stored in seconds.
	mock.timers.reset();
	mock.timers.enable({
		apis: ["Date"],
		now: new Date("2026-06-01T08:00:00Z"),
	});
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "drizzle" });
	const now = new Date();
	const users = Object.entries(NAMES).map(([id, name]) => ({
		id,
		name,
		email: `${id.toLowerCase()}@test.invalid`,
		emailVerified: true,
		image: null,
		createdAt: now,
		updatedAt: now,
	}));
	await db.insert(schema.user).values(users);
	await db.insert(schema.organization).values({
		id: "G",
		name: "Hassanamba temple visit",
		slug: "h",
		createdAt: now,
	});
	await db.insert(schema.member).values(
		users.map((u) => ({
			id: `member-${u.id}`,
			organizationId: "G",
			userId: u.id,
			role: u.id === "S" ? "owner" : "member",
			createdAt: now,
		})),
	);
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
			activeOrganizationId: "G",
			ipAddress: null,
			userAgent: null,
		},
	});
	const ctx = ctxFor("S");
	const tick = (seconds = 1) => mock.timers.tick(seconds * 1000);
	const spend = async (
		description: string,
		paidByUserId: string,
		shares: Record<string, number>,
		{ advance = true } = {},
	) => {
		if (advance) tick();
		const amountMinor = Object.values(shares).reduce((a, b) => a + b, 0);
		return createExpense(ctx, {
			groupId: "G",
			description,
			amountMinor,
			currency: "INR",
			paidByUserId,
			splitMethod: "exact",
			date: new Date("2026-05-30T00:00:00Z"),
			participants: exact(shares),
		});
	};
	const snack = async (amountMinor = 1000, { advance = true } = {}) => {
		if (advance) tick();
		return createExpense(ctx, {
			groupId: "G",
			description: "Snacks",
			amountMinor,
			currency: "INR",
			paidByUserId: "S",
			splitMethod: "even",
			date: new Date("2026-05-31T00:00:00Z"),
			participants: Object.keys(NAMES).map((userId) => ({
				userId,
				input: null,
			})),
		});
	};
	const pay = async (
		fromUserId: string,
		toUserId: string,
		amountMinor: number,
		{ advance = true } = {},
	) => {
		if (advance) tick();
		const row = await createSettlement(ctx, {
			groupId: "G",
			fromUserId,
			toUserId,
			currency: "INR",
			amountMinor,
		});
		assert.ok(row);
		return row;
	};
	const plan = async () =>
		(await getBalances(ctx, { groupId: "G" })).transfers.map(
			(t) => `${t.from.userId}>${t.to.userId}:${t.amountMinor}`,
		);
	const nets = async () =>
		Object.fromEntries(
			(await getBalances(ctx, { groupId: "G" })).members.map((m) => [
				m.userId,
				m.balanceMinor,
			]),
		);

	const hotel = await spend("Hotel", "S", {
		RK: 300000,
		T: 120000,
		RV: 180000,
		RJ: 106333,
		S: 150000,
	});
	const cab = await spend("Cab", "S", {
		RK: 189436,
		T: 80000,
		RV: 120000,
		RJ: 100000,
		S: 50000,
	});
	const offerings = await spend("Temple offerings", "L", {
		A: 235117,
		T: 189433,
		RV: 100000,
		RJ: 20000,
		L: 60000,
	});
	const lunch = await spend("Lunch", "L", {
		A: 200000,
		T: 100000,
		RV: 72033,
		RJ: 18384,
		L: 40000,
	});
	if (settle) {
		await pay("A", "L", 435117);
		await pay("RK", "S", 489436);
	}
	return {
		client,
		db,
		ctx,
		ctxFor,
		tick,
		spend,
		snack,
		pay,
		plan,
		nets,
		expenses: { hotel, cab, offerings, lunch },
		close() {
			client.close();
			mock.timers.reset();
		},
	};
}

type Group = Awaited<ReturnType<typeof group>>;

function parse(row: string) {
	const [pair, amount] = row.split(":");
	const [from, to] = pair.split(">");
	return { from, to, amountMinor: Number(amount) };
}

/** Rows other than `except` (by from>to) must be untouched. */
function assertOthersUnchanged(
	before: string[],
	after: string[],
	except: string,
) {
	const key = (row: string) => row.split(":")[0];
	assert.deepEqual(
		after.filter((row) => key(row) !== except).sort(),
		before.filter((row) => key(row) !== except).sort(),
		`paying ${except} changed other rows`,
	);
}

async function assertFullySettled(f: Group) {
	assert.deepEqual(await f.plan(), []);
	for (const [userId, balance] of Object.entries(await f.nets()))
		assert.equal(balance, 0, `${NAMES[userId]} still has ${balance}`);
}

function permutations<T>(items: T[]): T[][] {
	if (items.length <= 1) return [items];
	return items.flatMap((item, index) =>
		permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
			(rest) => [item, ...rest],
		),
	);
}

/** Deterministic PRNG so failing interleavings reproduce. */
function rng(seed: number) {
	return () => {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return seed / 0x7fffffff;
	};
}

test("baseline: incident balances and the replayed plan from the first payment", async () => {
	const f = await group();
	try {
		assert.deepEqual(await f.nets(), {
			S: 706333,
			L: 499850,
			T: -489433,
			RV: -472033,
			RJ: -244717,
			A: 0,
			RK: 0,
		});
		assert.deepEqual((await f.plan()).sort(), [...INITIAL_PLAN].sort());
	} finally {
		f.close();
	}
});

test("every order of paying the four rows: other rows never move, group ends settled", async () => {
	for (const order of permutations(INITIAL_PLAN)) {
		const f = await group();
		try {
			for (const row of order) {
				const before = await f.plan();
				const { from, to, amountMinor } = parse(row);
				await f.pay(from, to, amountMinor);
				const after = await f.plan();
				assert.ok(!after.some((r) => r.startsWith(`${from}>${to}:`)));
				assertOthersUnchanged(before, after, `${from}>${to}`);
			}
			await assertFullySettled(f);
		} catch (error) {
			throw new Error(
				`order ${order.join(" , ")}: ${(error as Error).message}`,
			);
		} finally {
			f.close();
		}
	}
});

test("random interleavings of partial payments (1-3 instalments per row) stay stable", async () => {
	for (let seed = 1; seed <= 15; seed++) {
		const random = rng(seed);
		const f = await group();
		try {
			const instalments: { from: string; to: string; amountMinor: number }[] =
				[];
			for (const row of INITIAL_PLAN) {
				const { from, to, amountMinor } = parse(row);
				const parts = 1 + Math.floor(random() * 3);
				let left = amountMinor;
				for (let i = 1; i < parts; i++) {
					const part = 1 + Math.floor(random() * (left - (parts - i)));
					instalments.push({ from, to, amountMinor: part });
					left -= part;
				}
				instalments.push({ from, to, amountMinor: left });
			}
			// Shuffle while keeping each row's instalments valid in any order.
			for (let i = instalments.length - 1; i > 0; i--) {
				const j = Math.floor(random() * (i + 1));
				[instalments[i], instalments[j]] = [instalments[j], instalments[i]];
			}
			for (const { from, to, amountMinor } of instalments) {
				const before = await f.plan();
				const row = before.find((r) => r.startsWith(`${from}>${to}:`));
				assert.ok(row, `${from}>${to} vanished before it was fully paid`);
				await f.pay(from, to, amountMinor);
				const after = await f.plan();
				assertOthersUnchanged(before, after, `${from}>${to}`);
				const left = parse(row).amountMinor - amountMinor;
				if (left)
					assert.ok(
						after.includes(`${from}>${to}:${left}`),
						"row did not shrink",
					);
			}
			await assertFullySettled(f);
		} catch (error) {
			throw new Error(`seed ${seed}: ${(error as Error).message}`);
		} finally {
			f.close();
		}
	}
});

test("marking shares paid works along a row and leaves other rows alone", async () => {
	const f = await group();
	try {
		// Thillairajan's row is to Latha; his two shares on Latha's expenses fit.
		let before = await f.plan();
		f.tick();
		await setSharePaid(
			f.ctx,
			{ expenseId: f.expenses.offerings.id, userId: "T" },
			true,
		);
		let after = await f.plan();
		assertOthersUnchanged(before, after, "T>L");
		assert.ok(after.includes("T>L:300000"));
		before = after;
		f.tick();
		await setSharePaid(
			f.ctx,
			{ expenseId: f.expenses.lunch.id, userId: "T" },
			true,
		);
		after = await f.plan();
		assertOthersUnchanged(before, after, "T>L");
		assert.ok(after.includes("T>L:200000"));
		// Rest by a settlement, mixing the two ways of paying.
		before = after;
		await f.pay("T", "L", 200000);
		after = await f.plan();
		assertOthersUnchanged(before, after, "T>L");
		// Ravi: hotel and cab shares to Siva, then the rest by settlement.
		f.tick();
		await setSharePaid(
			f.ctx,
			{ expenseId: f.expenses.hotel.id, userId: "RV" },
			true,
		);
		f.tick();
		await setSharePaid(
			f.ctx,
			{ expenseId: f.expenses.cab.id, userId: "RV" },
			true,
		);
		assert.ok((await f.plan()).includes("RV>S:172033"));
		await f.pay("RV", "S", 172033);
		await f.pay("RJ", "S", 234300);
		await f.pay("RJ", "L", 10417);
		await assertFullySettled(f);
		// Unmarking a share restores exactly the row it paid.
		const settled = await f.plan();
		f.tick();
		await setSharePaid(
			f.ctx,
			{ expenseId: f.expenses.hotel.id, userId: "RV" },
			false,
		);
		assert.deepEqual(await f.plan(), ["RV>S:180000"]);
		f.tick();
		await setSharePaid(
			f.ctx,
			{ expenseId: f.expenses.hotel.id, userId: "RV" },
			true,
		);
		assert.deepEqual(await f.plan(), settled);
	} finally {
		f.close();
	}
});

test("trade-off: shares larger than a debtor's row can't be marked paid (Raji -> Latha ₹104.17)", async () => {
	const f = await group();
	try {
		// Raji owes Latha ₹200 + ₹183.84 on the expense pages, but the list only
		// has a ₹104.17 row to Latha, so neither share can be ticked.
		await assert.rejects(
			setSharePaid(
				f.ctx,
				{ expenseId: f.expenses.offerings.id, userId: "RJ" },
				true,
			),
			/can't be more than/,
		);
		await assert.rejects(
			setSharePaid(
				f.ctx,
				{ expenseId: f.expenses.lunch.id, userId: "RJ" },
				true,
			),
			/can't be more than/,
		);
		// Thillairajan's shares on Siva's expenses: no T->S row at all.
		await assert.rejects(
			setSharePaid(
				f.ctx,
				{ expenseId: f.expenses.hotel.id, userId: "T" },
				true,
			),
			/No INR payment is owed/,
		);
		assert.deepEqual((await f.plan()).sort(), [...INITIAL_PLAN].sort());
	} finally {
		f.close();
	}
});

test("BUG: a member who settled through an indirect row can never leave or be removed", {
	todo: "leave check uses unpaid shares, not balance",
}, async () => {
	const f = await group();
	try {
		// Thillairajan pays exactly what the list tells him to: ₹4,894.33 to Latha.
		await f.pay("T", "L", 489433);
		assert.equal((await f.nets()).T, 0);
		assert.ok(!(await f.plan()).some((row) => row.startsWith("T>")));
		// Everyone else pays too; the group shows nothing left to settle.
		await f.pay("RV", "S", 472033);
		await f.pay("RJ", "S", 234300);
		await f.pay("RJ", "L", 10417);
		await assertFullySettled(f);
		// His ₹2,000 of shares on Siva's hotel and cab stay "unpaid" and the only
		// way to tick them is rejected because no T->S row exists any more.
		const hotel = await getExpense(f.ctx, { expenseId: f.expenses.hotel.id });
		assert.equal(hotel.shares.find((s) => s.userId === "T")?.paidAt, null);
		await assert.rejects(
			setSharePaid(
				f.ctx,
				{ expenseId: f.expenses.hotel.id, userId: "T" },
				true,
			),
			/No INR payment is owed/,
		);
		// Expected: a fully settled member can leave. Actual: CONFLICT forever.
		await removeMember(f.ctx, { groupId: "G", userId: "T" });
		await leaveGroup(f.ctxFor("RV"), { groupId: "G" });
	} finally {
		f.close();
	}
});

test("trade-off: a ₹10 snack right after deploy reassigns every debtor to the other creditor", async () => {
	const f = await group();
	try {
		const before = await f.plan();
		await f.snack(1000);
		const after = await f.plan();
		const pairs = (rows: string[]) => new Set(rows.map((r) => r.split(":")[0]));
		const kept = [...pairs(before)].filter((p) => pairs(after).has(p));
		const exactKept = before.filter((r) => after.includes(r));
		console.log("₹10 snack, before:", before, "after:", after);
		console.log(
			`pairs kept ${kept.length}/${before.length}, rows identical ${exactKept.length}/${before.length}, rows after ${after.length}`,
		);
		// Measured: no row survives unchanged; Thillairajan's and Ravi's whole
		// debts swap creditor (only Raji, who owes both, keeps both pairs). This
		// is the old pre-fix greedy plan again, triggered by a ₹10 expense.
		assert.deepEqual(exactKept, []);
		assert.deepEqual(kept.sort(), ["RJ>L", "RJ>S"]);
		assert.ok(after.includes("T>S:489575"));
		assert.ok(after.includes("RV>L:472176"));
	} finally {
		f.close();
	}
});

test("₹10 snack mid-settlement: measure churn after a couple of rows were paid", async () => {
	const f = await group();
	try {
		await f.pay("RJ", "S", 234300);
		await f.pay("T", "L", 200000); // half of Thillairajan's row
		const before = await f.plan();
		await f.snack(1000);
		const after = await f.plan();
		const pairs = (rows: string[]) => new Set(rows.map((r) => r.split(":")[0]));
		const kept = [...pairs(before)].filter((p) => pairs(after).has(p));
		console.log("mid-settlement ₹10 snack, before:", before, "after:", after);
		console.log(
			`pairs kept ${kept.length}/${before.length}, rows after ${after.length}`,
		);
		// Each existing pair should at least survive (amounts move by ≤ ₹10).
		for (const row of before) {
			const { from, to, amountMinor } = parse(row);
			const now = after.find((r) => r.startsWith(`${from}>${to}:`));
			assert.ok(now, `${from}>${to} disappeared after a ₹10 expense`);
			assert.ok(Math.abs(parse(now).amountMinor - amountMinor) <= 1000);
		}
	} finally {
		f.close();
	}
});

test("adding then deleting a mistaken expense restores the list exactly", async () => {
	const f = await group();
	try {
		await f.pay("RJ", "L", 10417);
		const before = await f.plan();
		const mistake = await f.snack(1000);
		assert.notDeepEqual(await f.plan(), before);
		f.tick();
		await deleteExpense(f.ctx, { expenseId: mistake.id });
		assert.deepEqual(await f.plan(), before);
	} finally {
		f.close();
	}
});

test("record then delete a payment (the incident loop) returns to the same list every time", async () => {
	const f = await group();
	try {
		const before = await f.plan();
		for (let i = 0; i < 5; i++) {
			// The old UI's amount: still fits the Raji -> Siva row as a partial.
			const payment = await f.pay("RJ", "S", 216900);
			const during = await f.plan();
			assertOthersUnchanged(before, during, "RJ>S");
			assert.ok(during.includes("RJ>S:17400"));
			f.tick();
			await deleteSettlement(f.ctx, { settlementId: payment.id });
			assert.deepEqual(await f.plan(), before);
		}
	} finally {
		f.close();
	}
});

test("record A, record B, delete A leaves only B's effect", async () => {
	const f = await group();
	try {
		const a = await f.pay("RJ", "S", 234300);
		await f.pay("T", "L", 489433);
		f.tick();
		await deleteSettlement(f.ctx, { settlementId: a.id });
		assert.deepEqual(
			(await f.plan()).sort(),
			["RV>S:472033", "RJ>S:234300", "RJ>L:10417"].sort(),
		);
	} finally {
		f.close();
	}
});

test("record A, snack, pay along the new plan, delete A: list is whatever greedy says", async () => {
	const f = await group();
	try {
		const a = await f.pay("RJ", "S", 234300);
		await f.snack(1000);
		const mid = await f.plan();
		const first = parse(mid[0]);
		await f.pay(first.from, first.to, first.amountMinor);
		const withA = await f.plan();
		f.tick();
		await deleteSettlement(f.ctx, { settlementId: a.id });
		const withoutA = await f.plan();
		console.log(
			"after snack:",
			mid,
			"\npaid",
			mid[0],
			"\nwith A:",
			withA,
			"\nA deleted:",
			withoutA,
		);
		// Deleting A rewrites history before the snack: the list is rebuilt, so
		// rows of people unrelated to A (and to Raji) can move.
		const untouched = withA.filter(
			(r) => !r.startsWith("RJ>") && !withoutA.includes(r),
		);
		console.log("non-Raji rows changed by deleting Raji's payment:", untouched);
	} finally {
		f.close();
	}
});

test("wrong person, overpayment and stale old-UI rows are rejected without touching the list", async () => {
	const f = await group();
	try {
		const before = await f.plan();
		// Old UI told Thillairajan to pay Siva.
		await assert.rejects(f.pay("T", "S", 489433), /No INR payment is owed/);
		// Raji pays her whole ₹2,447.17 to Siva in one go.
		await assert.rejects(f.pay("RJ", "S", 244717), /can't be more than/);
		// Overpay by a paisa.
		await assert.rejects(f.pay("RV", "S", 472034), /can't be more than/);
		// Creditor to debtor.
		await assert.rejects(f.pay("L", "T", 100), /No INR payment is owed/);
		assert.deepEqual(await f.plan(), before);
	} finally {
		f.close();
	}
});

test("same-second: a payment and an expense recorded in the same second match the 1s-apart list", {
	todo: "ledger ordering by sequence",
}, async () => {
	const scenarios: [string, number][] = [
		["RJ>L", 10417],
		["RJ>S", 234300],
		["T>L", 100000],
		["RV>S", 472033],
	];
	for (const [pair, amount] of scenarios) {
		const [from, to] = pair.split(">");
		const apart = await group();
		let a: string[];
		try {
			await apart.pay(from, to, amount);
			await apart.snack(1000);
			a = await apart.plan();
		} finally {
			apart.close();
		}
		const together = await group();
		try {
			await together.pay(from, to, amount);
			await together.snack(1000, { advance: false });
			const b = await together.plan();
			console.log(pair, amount, "1s apart:", a, "same second:", b);
			assert.deepEqual(
				b,
				a,
				`${pair} ${amount}: same-second order changed the list`,
			);
		} finally {
			together.close();
		}
	}
});

test("same-second: payment, then a payment that was only valid after an expense in the same second", async () => {
	const f = await group();
	try {
		// Snack and two payments all in one second; validated in real order.
		f.tick();
		await f.snack(1000, { advance: false });
		const plan = await f.plan();
		const row = parse(plan[0]);
		await f.pay(row.from, row.to, row.amountMinor, { advance: false });
		const after = await f.plan();
		assertOthersUnchanged(plan, after, `${row.from}>${row.to}`);
	} finally {
		f.close();
	}
});

test("a member who paid fully via allocated shares can be removed and the list doesn't move", async () => {
	const f = await group();
	try {
		const before = await f.plan();
		// Ravikumar's payment to Siva covered all his Siva shares.
		await removeMember(f.ctx, { groupId: "G", userId: "RK" });
		assert.deepEqual(await f.plan(), before);
		await leaveGroup(f.ctxFor("A"), { groupId: "G" });
		assert.deepEqual(await f.plan(), before);
		// The rest can still settle up completely.
		for (const row of INITIAL_PLAN) {
			const { from, to, amountMinor } = parse(row);
			await f.pay(from, to, amountMinor);
		}
		await assertFullySettled(f);
	} finally {
		f.close();
	}
});

test("deploy day: the list differs from the old greedy list exactly once, then is stable", async () => {
	const f = await group();
	try {
		const first = await f.plan();
		for (let i = 0; i < 3; i++) assert.deepEqual(await f.plan(), first);
		// Old UI rows that are no longer offered:
		for (const old of ["T>S", "RV>L"])
			assert.ok(!first.some((r) => r.startsWith(`${old}:`)));
	} finally {
		f.close();
	}
});
