import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import {
	expenseRecipients,
	updatedExpenseRecipients,
} from "#/server/domain/activity";
import {
	createExpense,
	createSettlement,
	deleteExpense,
	listMyActivity,
	removeMember,
	updateExpense,
} from "#/server/services/app";

test("expense recipients are signed from each person's side", () => {
	assert.deepEqual(
		expenseRecipients("B", 30000, [
			{ userId: "A", amountMinor: 10000 },
			{ userId: "B", amountMinor: 10000 },
			{ userId: "C", amountMinor: 10000 },
		]),
		[
			{ userId: "B", deltaMinor: 20000 },
			{ userId: "A", deltaMinor: -10000 },
			{ userId: "C", deltaMinor: -10000 },
		],
	);
	// A payer who isn't a participant gets the whole amount back.
	assert.deepEqual(
		expenseRecipients("B", 500, [{ userId: "A", amountMinor: 500 }]),
		[
			{ userId: "B", deltaMinor: 500 },
			{ userId: "A", deltaMinor: -500 },
		],
	);
	assert.deepEqual(
		updatedExpenseRecipients(
			[
				{ userId: "A", deltaMinor: -1 },
				{ userId: "C", deltaMinor: -1 },
			],
			[{ userId: "A", deltaMinor: -2 }],
		),
		[
			{ userId: "A", deltaMinor: -2 },
			{ userId: "C", deltaMinor: 0 },
		],
	);
});

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
	const as = (index: number): Ctx => ({
		db,
		user: users[index],
		apiKeyId: "test",
		session: {
			id: "test",
			userId: users[index].id,
			token: "test",
			expiresAt: now,
			createdAt: now,
			updatedAt: now,
			activeOrganizationId: "G",
			ipAddress: null,
			userAgent: null,
		},
	});
	return { client, as, now };
}

test("the personal feed follows each person through an expense's life and out of the group", async () => {
	const { client, as, now } = await fixture();
	const [a, b, c] = [as(0), as(1), as(2)];
	try {
		const base = {
			description: "Dinner",
			currency: "INR",
			paidByUserId: "B",
			splitMethod: "even" as const,
			date: now,
		};
		const created = await createExpense(a, {
			...base,
			groupId: "G",
			amountMinor: 30000,
			participants: ["A", "B", "C"].map((userId) => ({ userId, input: null })),
		});
		await updateExpense(a, {
			...base,
			expenseId: created.id,
			amountMinor: 30000,
			participants: ["A", "B"].map((userId) => ({ userId, input: null })),
		});

		const feedOf = async (ctx: Ctx) =>
			Object.fromEntries(
				(await listMyActivity(ctx)).items.map((item) => [
					item.type,
					item.deltaMinor,
				]),
			);
		assert.deepEqual(await feedOf(b), {
			"expense.created": 20000,
			"expense.updated": 15000,
		});
		// C was dropped by the edit, and is still told about it.
		assert.deepEqual(await feedOf(c), {
			"expense.created": -10000,
			"expense.updated": 0,
		});

		await deleteExpense(a, { expenseId: created.id });
		assert.equal((await feedOf(a))["expense.deleted"], -15000);
		assert.equal((await feedOf(c))["expense.deleted"], undefined);

		await removeMember(a, { groupId: "G", userId: "C" });
		const removed = (await listMyActivity(c)).items.find(
			(item) => item.type === "member.removed",
		);
		assert.ok(removed, "a removed member still sees their removal");
		assert.equal(removed.isMember, false);
		assert.equal(removed.groupName, "Test");

		// B owes nothing now, so a payment from A can't be recorded; add one first.
		await createExpense(b, {
			...base,
			groupId: "G",
			amountMinor: 1000,
			participants: [{ userId: "A", input: null }],
		});
		await createSettlement(a, {
			groupId: "G",
			toUserId: "B",
			currency: "INR",
			amountMinor: 1000,
		});
		const payment = await listMyActivity(b);
		const received = payment.items.find(
			(item) => item.type === "settlement.created",
		);
		assert.ok(received);
		assert.equal(payment.names[received.metadata.toUserId], "B");
		assert.equal(payment.names[received.metadata.fromUserId], "A");
	} finally {
		client.close();
	}
});

test("paging through the feed visits every row once, even within one second", async () => {
	const { client, as, now } = await fixture();
	const a = as(0);
	try {
		for (let index = 0; index < 5; index++)
			await createExpense(a, {
				groupId: "G",
				description: `Expense ${index}`,
				amountMinor: 3000,
				currency: "INR",
				paidByUserId: "A",
				splitMethod: "even",
				date: now,
				participants: [{ userId: "B", input: null }],
			});
		const seen: string[] = [];
		let cursor: string | undefined;
		do {
			const page = await listMyActivity(a, { cursor, limit: 2 });
			seen.push(...page.items.map((item) => item.id));
			cursor = page.nextCursor ?? undefined;
		} while (cursor);
		assert.equal(seen.length, 5);
		assert.equal(new Set(seen).size, 5);
		await assert.rejects(listMyActivity(a, { cursor: "nonsense" }), /cursor/);
	} finally {
		client.close();
	}
});
