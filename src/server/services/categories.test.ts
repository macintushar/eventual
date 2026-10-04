import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import {
	applyCategories,
	createCategoryRule,
	previewCategoryBackfill,
} from "#/server/services/categories";

test("category rules backfill existing expenses", async () => {
	const client = createClient({ url: ":memory:" });
	try {
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: "./drizzle" });
		const now = new Date("2026-09-01T00:00:00Z");
		const owner = {
			id: "A",
			name: "Zoe",
			email: "zoe@test.invalid",
			emailVerified: true,
			image: null,
			createdAt: now,
			updatedAt: now,
		};
		await db.insert(schema.user).values(owner);
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
		const rows: [string, string, string | null][] = [
			["E1", "Zomato order", null],
			["E2", "Zomato team lunch", "Work"],
			["E3", "Uber home", null],
			["E4", "Birthday gift", "Gifts"],
			["E5", "Taxi", "Transport"],
		];
		await db.insert(schema.expense).values(
			rows.map(([id, description, category]) => ({
				id,
				organizationId: "G",
				description,
				category,
				amountMinor: 100,
				currency: "INR",
				paidByUserId: "A",
				splitMethod: "even" as const,
				date: now,
				createdByUserId: "A",
				createdAt: now,
				updatedAt: now,
			})),
		);
		const ctx = { db, user: owner } as Ctx;
		const categoryOf = async (id: string) =>
			(await db.query.expense.findFirst({ where: eq(schema.expense.id, id) }))
				?.category;

		// Built-ins fill gaps; unmatched expenses keep the category someone picked.
		const before = await previewCategoryBackfill(ctx, { groupId: "G" });
		assert.deepEqual(
			before.changes.map((row) => [row.expenseId, row.category]),
			[
				["E3", "Transport"],
				["E2", "Food & drink"],
				["E1", "Other"],
			],
		);

		const rule = await createCategoryRule(ctx, {
			groupId: "G",
			pattern: "Zomato",
			category: "Takeout",
			applyToExisting: true,
		});
		assert.equal(rule.recategorized, 2);
		assert.equal(await categoryOf("E1"), "Takeout");
		assert.equal(await categoryOf("E2"), "Takeout");
		const [e1] = await db
			.select({ searchText: schema.expense.searchText })
			.from(schema.expense)
			.where(eq(schema.expense.id, "E1"));
		assert.match(e1.searchText, /takeout/);

		const scoped = await previewCategoryBackfill(ctx, {
			groupId: "G",
			ruleId: rule.id,
		});
		assert.equal(scoped.changes.length, 0);

		const applied = await applyCategories(ctx, {
			groupId: "G",
			changes: [
				{ expenseId: "E3", category: "Transport" },
				{ expenseId: "E5", category: "Transport" },
				{ expenseId: "missing", category: "Transport" },
			],
		});
		assert.equal(applied.updated, 1);
		assert.equal(await categoryOf("E3"), "Transport");
		assert.equal(await categoryOf("E4"), "Gifts");
	} finally {
		client.close();
	}
});
