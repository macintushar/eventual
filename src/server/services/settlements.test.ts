import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import { validateRepayment } from "#/lib/settlements";
import type { Ctx } from "#/server/context";
import {
	createExpense,
	createInvitation,
	createSettlement,
	deleteSettlement,
	getBalances,
	getExpense,
	listGroups,
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

test("USD repayment closes only USD shares, rejects overpayment, and deletion restores only USD", async () => {
	const f = await fixture();
	try {
		const inr = await f.expense("INR");
		const usd = await f.expense("USD");
		await assert.rejects(f.pay("USD", 40000), /cannot pay more/);
		assert.equal((await f.db.query.settlement.findMany()).length, 0);
		const payment = await f.pay("USD", 20000);
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
		const balances = await getBalances(f.ctx, { groupId: "G" });
		assert.deepEqual(
			balances.transfers.map((t) => [t.currency, t.amountMinor]),
			[["INR", 20000]],
		);
		await assert.rejects(f.pay("USD", 1), /No USD payment/);
		await assert.rejects(
			setSharePaid(f.ctx, { expenseId: usd.id, userId: "A" }, false),
			/linked settlement/,
		);
		await deleteSettlement(f.ctx, { settlementId: payment.id });
		assert.equal(
			(await getBalances(f.ctx, { groupId: "G" })).transfers.length,
			2,
		);
		assert.equal(
			(await getExpense(f.ctx, { expenseId: usd.id })).shares[0].paidAt,
			null,
		);
	} finally {
		f.client.close();
	}
});

test("partial repayments reduce the limit; stale submissions and paid toggles cannot overpay", async () => {
	const f = await fixture();
	try {
		const expense = await f.expense("USD");
		await f.expense("INR", 50000);
		await f.pay("USD", 5000);
		const balances = await getBalances(f.ctx, { groupId: "G" });
		assert.equal(
			balances.transfers.find((t) => t.currency === "USD")?.amountMinor,
			15000,
		);
		const invalid = validateRepayment(balances.transfers, {
			fromUserId: "A",
			toUserId: "B",
			currency: "USD",
			amountMinor: 20000,
		});
		assert.ok(invalid);
		await assert.rejects(
			f.pay("USD", 20000),
			(error: Error) => error.message === invalid,
		);
		await assert.rejects(
			setSharePaid(f.ctx, { expenseId: expense.id, userId: "A" }, true),
			/cannot pay more/,
		);
		await f.pay("USD", 15000);
		await assert.rejects(f.pay("USD", 1), /No USD payment/);
		const group = (await listGroups(f.ctx))[0];
		assert.deepEqual(
			group.balances.map((b) => [b.currency, b.balanceMinor]),
			[
				["INR", -50000],
				["USD", 0],
			],
		);
	} finally {
		f.client.close();
	}
});

test("simplified payments may go to an indirect creditor but never to another currency", async () => {
	const f = await fixture();
	try {
		await f.expense("USD", 20000, "B", "A");
		await f.expense("USD", 20000, "C", "B");
		await f.expense("INR", 10000, "B", "A");
		await assert.rejects(f.pay("USD", 20000, "B"), /No USD payment/);
		const payment = await f.pay("USD", 20000, "C");
		assert.ok(payment);
		assert.equal(payment.allocations.length, 0);
		assert.deepEqual(
			(await getBalances(f.ctx, { groupId: "G" })).transfers.map((t) => [
				t.currency,
				t.to.userId,
				t.amountMinor,
			]),
			[["INR", "B", 10000]],
		);
	} finally {
		f.client.close();
	}
});

test("simultaneous repayments cannot both consume the same outstanding debt", async () => {
	const f = await fixture();
	try {
		await f.expense("USD");
		const results = await Promise.allSettled([
			f.pay("USD", 20000),
			f.pay("USD", 20000),
		]);
		assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
		assert.equal((await f.db.query.settlement.findMany()).length, 1);
		assert.equal(
			(await getBalances(f.ctx, { groupId: "G" })).transfers.length,
			0,
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
