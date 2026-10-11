import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import {
	createExpense,
	createInvitation,
	createSettlement,
	deleteSettlement,
	getBalances,
	getExpense,
	setSharePaid,
} from "#/server/services/app";

async function fixture() {
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "drizzle" });
	const now = new Date();
	const users = ["A", "B", "C"].map((id) => ({
		id,
		name: id,
		email: `${id}@test.invalid`,
		emailVerified: true,
		image: null,
		createdAt: now,
		updatedAt: now,
	}));
	await db.insert(schema.user).values(users);
	await db
		.insert(schema.organization)
		.values({ id: "G", name: "Test", slug: "test", createdAt: now });
	await db.insert(schema.member).values(
		users.map((user) => ({
			id: `member-${user.id}`,
			organizationId: "G",
			userId: user.id,
			role: "owner",
			createdAt: now,
		})),
	);
	const ctx: Ctx = {
		db,
		user: users[0],
		apiKeyId: "test",
		apiKeyPermissions: null,
		session: {
			id: "test",
			userId: "A",
			token: "test",
			expiresAt: now,
			createdAt: now,
			updatedAt: now,
			activeOrganizationId: "G",
			ipAddress: null,
			userAgent: null,
		},
	};
	const expense = (
		currency: string,
		amountMinor = 20000,
		paidByUserId = "B",
		userId = "A",
	) =>
		createExpense(ctx, {
			groupId: "G",
			description: `${currency} expense`,
			amountMinor,
			currency,
			paidByUserId,
			splitMethod: "even",
			date: now,
			participants: [{ userId, input: null }],
		});
	const pay = (currency: string, amountMinor: number, toUserId = "B") =>
		createSettlement(ctx, { groupId: "G", toUserId, currency, amountMinor });
	return { client, db, ctx, expense, pay };
}

test("USD repayment closes only USD shares, overpayment flips the debt, and deletion restores only USD", async () => {
	const f = await fixture();
	try {
		const inr = await f.expense("INR");
		const usd = await f.expense("USD");
		// Twice the debt: the share is paid and the extra becomes a reverse debt.
		const payment = await f.pay("USD", 40000);
		assert.ok(payment);
		assert.equal(payment.currency, "USD");
		assert.equal(payment.allocations.length, 1);
		assert.ok(
			(await getExpense(f.ctx, { expenseId: usd.id })).shares[0].paidAt,
		);
		assert.equal(
			(await getExpense(f.ctx, { expenseId: inr.id })).shares[0].paidAt,
			null,
		);
		assert.deepEqual(
			(await getBalances(f.ctx, { groupId: "G" })).transfers.map((t) => [
				t.currency,
				t.from.userId,
				t.to.userId,
				t.amountMinor,
			]),
			[
				["INR", "A", "B", 20000],
				["USD", "B", "A", 20000],
			],
		);
		// The reverse direction records too; it just chips at A's credit.
		const gift = await f.pay("USD", 1);
		assert.ok(gift);
		assert.equal(gift.allocations.length, 0);
		await assert.rejects(
			setSharePaid(f.ctx, { expenseId: usd.id, userId: "A" }, false),
			/linked payment/,
		);
		await deleteSettlement(f.ctx, { settlementId: gift.id });
		await deleteSettlement(f.ctx, { settlementId: payment.id });
		assert.deepEqual(
			(await getBalances(f.ctx, { groupId: "G" })).transfers.map((t) => [
				t.currency,
				t.from.userId,
				t.to.userId,
				t.amountMinor,
			]),
			[
				["INR", "A", "B", 20000],
				["USD", "A", "B", 20000],
			],
		);
		assert.equal(
			(await getExpense(f.ctx, { expenseId: usd.id })).shares[0].paidAt,
			null,
		);
	} finally {
		f.client.close();
	}
});

test("partial repayments stack, paying past the debt flips it, and paid toggles are free", async () => {
	const f = await fixture();
	try {
		await f.expense("USD");
		await f.expense("INR", 50000);
		await f.pay("USD", 5000);
		assert.equal(
			(await getBalances(f.ctx, { groupId: "G" })).transfers.find(
				(t) => t.currency === "USD",
			)?.amountMinor,
			15000,
		);
		// More than the remaining debt: the share is paid and the rest flips.
		await f.pay("USD", 20000);
		assert.deepEqual(
			(await getBalances(f.ctx, { groupId: "G" })).transfers.map((t) => [
				t.currency,
				t.from.userId,
				t.to.userId,
				t.amountMinor,
			]),
			[
				["INR", "A", "B", 50000],
				["USD", "B", "A", 5000],
			],
		);
		// Marking a share paid never consults the simplified debts anymore.
		const second = await f.expense("USD");
		await setSharePaid(f.ctx, { expenseId: second.id, userId: "A" }, true);
		assert.ok(
			(await getExpense(f.ctx, { expenseId: second.id })).shares[0].paidAt,
		);
		await setSharePaid(f.ctx, { expenseId: second.id, userId: "A" }, false);
		assert.equal(
			(await getExpense(f.ctx, { expenseId: second.id })).shares[0].paidAt,
			null,
		);
	} finally {
		f.client.close();
	}
});

test("direct payments are always allowed and settle matching shares first", async () => {
	const f = await fixture();
	try {
		const first = await f.expense("USD", 20000, "B", "A");
		await f.expense("USD", 20000, "C", "B");
		await f.expense("INR", 10000, "B", "A");
		// Paying the actual creditor works even when the simplified debts
		// route the money indirectly; the matching USD share is marked paid.
		const payment = await f.pay("USD", 20000, "B");
		assert.ok(payment);
		assert.equal(payment.allocations.length, 1);
		assert.ok(
			(await getExpense(f.ctx, { expenseId: first.id })).shares[0].paidAt,
		);
		assert.deepEqual(
			(await getBalances(f.ctx, { groupId: "G" })).transfers.map((t) => [
				t.currency,
				t.from.userId,
				t.to.userId,
				t.amountMinor,
			]),
			[
				["INR", "A", "B", 10000],
				["USD", "B", "C", 20000],
			],
		);
	} finally {
		f.client.close();
	}
});

test("a payment allocates complete shares FIFO and skips one that does not fit", async () => {
	const f = await fixture();
	try {
		// Two USD shares of very different sizes, dated to fix FIFO order.
		const older = await createExpense(f.ctx, {
			groupId: "G",
			description: "USD expense 1",
			amountMinor: 15000,
			currency: "USD",
			paidByUserId: "B",
			splitMethod: "even",
			date: new Date("2026-01-01"),
			participants: [{ userId: "A", input: null }],
		});
		const newer = await createExpense(f.ctx, {
			groupId: "G",
			description: "USD expense 2",
			amountMinor: 8000,
			currency: "USD",
			paidByUserId: "B",
			splitMethod: "even",
			date: new Date("2026-06-01"),
			participants: [{ userId: "A", input: null }],
		});
		const payment = await f.pay("USD", 20000);
		assert.ok(payment);
		// The older share fits, so it is marked paid; the newer one does not.
		assert.deepEqual(
			payment.allocations.map((a) => a.amountMinor),
			[15000],
		);
		assert.ok(
			(await getExpense(f.ctx, { expenseId: older.id })).shares[0].paidAt,
		);
		assert.equal(
			(await getExpense(f.ctx, { expenseId: newer.id })).shares[0].paidAt,
			null,
		);
		// $150 allocated + $50 remainder leaves a $30 net debt (of the $80 share).
		assert.deepEqual(
			(await getBalances(f.ctx, { groupId: "G" })).transfers.map((t) => [
				t.currency,
				t.from.userId,
				t.to.userId,
				t.amountMinor,
			]),
			[["USD", "A", "B", 3000]],
		);
	} finally {
		f.client.close();
	}
});

test("a payment recorded twice still only settles the shares once", async () => {
	const f = await fixture();
	try {
		await f.expense("USD");
		// Two payments for the same debt both record; the second finds no unpaid
		// share left for it and lands entirely as a reverse debt.
		const first = await f.pay("USD", 20000);
		const second = await f.pay("USD", 20000);
		assert.ok(first && second);
		assert.equal(first.allocations.length, 1);
		assert.equal(second.allocations.length, 0);
		assert.deepEqual(
			(await getBalances(f.ctx, { groupId: "G" })).transfers.map((t) => [
				t.currency,
				t.from.userId,
				t.to.userId,
				t.amountMinor,
			]),
			[["USD", "B", "A", 20000]],
		);
	} finally {
		f.client.close();
	}
});

test("retrying an invitation reuses the live pending invitation", async () => {
	const f = await fixture();
	try {
		const input = {
			groupId: "G",
			email: "guest@example.com",
			role: "member" as const,
		};
		const first = await createInvitation(f.ctx, input);
		const retry = await createInvitation(f.ctx, input);
		assert.equal(retry.invitationId, first.invitationId);
		assert.equal((await f.db.query.invitation.findMany()).length, 1);
		assert.equal(
			(await f.db.query.activity.findMany()).filter(
				(row) => row.type === "member.invited",
			).length,
			1,
		);
		await assert.rejects(
			createInvitation(f.ctx, { ...input, role: "admin" }),
			/already has a pending member invitation/,
		);
	} finally {
		f.client.close();
	}
});
