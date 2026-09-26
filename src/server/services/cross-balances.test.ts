import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import { createExpense } from "#/server/services/app";
import { getCrossGroupBalances } from "#/server/services/balances";

type Fixture = {
	client: ReturnType<typeof createClient>;
	ctx: Ctx;
	expense: (
		groupId: string,
		amountMinor?: number,
		paidBy?: string,
		participant?: string,
		currency?: string,
	) => Promise<unknown>;
};

async function fixture(): Promise<Fixture> {
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "./drizzle" });
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
	for (const [groupId, name, memberIds] of [
		["G1", "Trip One", ["A", "B"]],
		["G2", "Trip Two", ["A", "B", "C"]],
	] as const) {
		await db.insert(schema.organization).values({
			id: groupId,
			name,
			slug: groupId.toLowerCase(),
			createdAt: now,
		});
		await db.insert(schema.member).values(
			memberIds.map((userId) => ({
				id: `member-${groupId}-${userId}`,
				organizationId: groupId,
				userId,
				role: userId === "A" ? "owner" : "member",
				createdAt: now,
			})),
		);
	}
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
			activeOrganizationId: "G1",
			ipAddress: null,
			userAgent: null,
		},
	};
	const expense = (
		groupId: string,
		amountMinor = 20000,
		paidBy = "B",
		participant = "A",
		currency = "INR",
	) =>
		createExpense(ctx, {
			groupId,
			description: `${currency} expense`,
			amountMinor,
			currency,
			paidByUserId: paidBy,
			splitMethod: "even",
			date: now,
			participants: [{ userId: participant, input: null }],
		});
	return { client, ctx, expense };
}

test("same-currency counterparty debts net across groups, broken down per group", async () => {
	const f = await fixture();
	try {
		await f.expense("G1", 30000);
		await f.expense("G2", 20000, "A", "B");
		const rows = await getCrossGroupBalances(f.ctx);
		assert.equal(rows.length, 1);
		const pair = rows[0];
		assert.equal(pair?.counterpartyUserId, "B");
		assert.equal(pair?.counterpartyName, "B");
		assert.equal(pair?.currency, "INR");
		assert.equal(pair?.amountMinor, -10000);
		const breakdown = new Map(
			pair?.groups.map((g) => [g.groupId, g.amountMinor]),
		);
		assert.equal(breakdown.get("G1"), -30000);
		assert.equal(breakdown.get("G2"), 20000);
		assert.deepEqual(
			pair?.groups.map((g) => g.groupName),
			["Trip One", "Trip Two"],
		);
	} finally {
		f.client.close();
	}
});

test("different currencies never net and third parties stay invisible", async () => {
	const f = await fixture();
	try {
		await f.expense("G1", 20000, "B", "A", "USD");
		await f.expense("G2", 20000, "A", "C");
		const rows = await getCrossGroupBalances(f.ctx);
		assert.equal(rows.length, 2);
		const usd = rows.find((row) => row.currency === "USD");
		const inr = rows.find((row) => row.currency === "INR");
		assert.deepEqual(usd, {
			counterpartyUserId: "B",
			counterpartyName: "B",
			currency: "USD",
			amountMinor: -20000,
			groups: [{ groupId: "G1", groupName: "Trip One", amountMinor: -20000 }],
		});
		assert.equal(inr?.counterpartyUserId, "C");
		assert.equal(inr?.amountMinor, 20000);
		assert.equal(
			inr?.groups.every((g) => g.groupId === "G2"),
			true,
		);
	} finally {
		f.client.close();
	}
});

test("a caller with no groups gets an empty report", async () => {
	const f = await fixture();
	try {
		await f.ctx.db.delete(schema.member).where(eq(schema.member.userId, "A"));
		assert.deepEqual(await getCrossGroupBalances(f.ctx), []);
	} finally {
		f.client.close();
	}
});
