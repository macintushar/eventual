import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import { createExpense } from "#/server/services/app";
import { getPaymentIntents } from "#/server/services/payments";

async function fixture() {
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "/tmp/opencode/drizzle-tmp" });
	const now = new Date();
	const users = [
		{ id: "A", name: "Asha", upiVpa: null },
		{ id: "B", name: "Ben", upiVpa: "asha.k@okicici" },
		{ id: "C", name: "Cal", upiVpa: null },
	].map((user) => ({
		id: user.id,
		name: user.name,
		email: `${user.id}@test.invalid`,
		emailVerified: true,
		upiVpa: user.upiVpa,
		image: null,
		createdAt: now,
		updatedAt: now,
	}));
	await db.insert(schema.user).values(users);
	await db.insert(schema.organization).values({
		id: "G",
		name: "Trip",
		slug: "trip",
		createdAt: now,
	});
	await db.insert(schema.member).values(
		users.map((user) => ({
			id: `member-${user.id}`,
			organizationId: "G",
			userId: user.id,
			role: user.id === "A" ? "owner" : "member",
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
		amountMinor: number,
		paidBy: string,
		participant: string,
		currency = "INR",
	) =>
		createExpense(ctx, {
			groupId: "G",
			description: `owe ${paidBy}`,
			amountMinor,
			currency,
			paidByUserId: paidBy,
			splitMethod: "even",
			date: now,
			participants: [{ userId: participant, input: null }],
		});
	return { client, ctx, expense };
}

test("every INR simplified transfer becomes an intent; missing VPA means a null upiUrl", async () => {
	const f = await fixture();
	try {
		await f.expense(20000, "B", "A");
		await f.expense(10000, "C", "A");
		const { intents } = await getPaymentIntents(f.ctx, { groupId: "G" });
		assert.equal(intents.length, 2);
		const toBen = intents.find((intent) => intent.toUserId === "B");
		const toCal = intents.find((intent) => intent.toUserId === "C");
		assert.equal(
			toBen?.upiUrl,
			"upi://pay?pa=asha.k%40okicici&pn=Ben&am=200.00&cu=INR",
		);
		assert.equal(toCal?.upiUrl, null);
		assert.equal(toBen?.fromUserId, "A");
		assert.equal(toBen?.amountMinor, 20000);
		assert.equal(toBen?.currency, "INR");
	} finally {
		f.client.close();
	}
});

test("non-INR transfers are excluded and settled groups produce nothing", async () => {
	const f = await fixture();
	try {
		await f.expense(20000, "B", "A", "USD");
		await f.expense(5000, "B", "A");
		await f.ctx.db
			.delete(schema.settlement)
			.where(eq(schema.settlement.id, "__none__"));
		await f.ctx.db.insert(schema.settlement).values({
			id: "S1",
			organizationId: "G",
			fromUserId: "A",
			toUserId: "B",
			amountMinor: 5000,
			currency: "INR",
			createdByUserId: "A",
			createdAt: new Date(),
		});
		const { intents } = await getPaymentIntents(f.ctx, { groupId: "G" });
		assert.equal(intents.length, 0);
	} finally {
		f.client.close();
	}
});

test("membership is still enforced", async () => {
	const f = await fixture();
	try {
		await assert.rejects(
			getPaymentIntents({ ...f.ctx, user: { ...f.ctx.user, id: "Z" } } as Ctx, {
				groupId: "G",
			}),
			/not a member/,
		);
	} finally {
		f.client.close();
	}
});
