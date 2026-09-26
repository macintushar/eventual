import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import { listExpenses } from "#/server/services/expenses";

test("expense pages sort the complete matching set", async () => {
	const client = createClient({ url: ":memory:" });
	try {
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: "./drizzle" });
		const now = new Date("2026-09-01T00:00:00Z");
		const users = [
			{ id: "A", name: "Zoe", email: "zoe@test.invalid" },
			{ id: "B", name: "Amy", email: "amy@test.invalid" },
		].map((row) => ({
			...row,
			emailVerified: true,
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
		await db.insert(schema.member).values({
			id: "member-A",
			organizationId: "G",
			userId: "A",
			role: "owner",
			createdAt: now,
		});
		await db.insert(schema.expense).values(
			Array.from({ length: 35 }, (_, index) => ({
				id: `E${String(index).padStart(2, "0")}`,
				organizationId: "G",
				description: `Expense ${String(index).padStart(2, "0")}`,
				category: index === 0 ? null : "Food",
				amountMinor: index + 1,
				currency: "INR",
				paidByUserId: index % 2 ? "B" : "A",
				splitMethod: "even" as const,
				date: new Date(now.getTime() + index * 86_400_000),
				createdByUserId: "A",
				createdAt: now,
				updatedAt: now,
			})),
		);
		const ctx = { db, user: users[0] } as Ctx;

		const first = await listExpenses(ctx, {
			groupId: "G",
			offset: 0,
			sortBy: "description",
			sortDirection: "asc",
		});
		assert.equal(first.items.length, 30);
		assert.equal(first.items[0].id, "E00");
		assert.equal(first.items[29].id, "E29");
		assert.equal(first.nextOffset, 30);
		const second = await listExpenses(ctx, {
			groupId: "G",
			offset: first.nextOffset ?? 0,
			sortBy: "description",
			sortDirection: "asc",
		});
		assert.deepEqual(
			second.items.map((row) => row.id),
			["E30", "E31", "E32", "E33", "E34"],
		);
		assert.equal(second.nextOffset, null);

		const byPayer = await listExpenses(ctx, {
			groupId: "G",
			offset: 0,
			sortBy: "payer",
			sortDirection: "asc",
		});
		assert.ok(
			byPayer.items.slice(0, 17).every((row) => row.payer.name === "Amy"),
		);
		const byCategory = await listExpenses(ctx, {
			groupId: "G",
			offset: 30,
			sortBy: "category",
			sortDirection: "asc",
		});
		assert.equal(byCategory.items.at(-1)?.category, null);
	} finally {
		client.close();
	}
});
