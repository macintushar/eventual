import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import * as schema from "#/db/schema";
import { computeBalances } from "#/server/domain/balances";
import { listActivity, listMyActivity } from "./activity";
import { readBalances } from "./balances";
import { listExpensePage } from "./expense-pages";
import { listExpenses } from "./expenses";
import { paginationFixture } from "./pagination-fixture";
import { listSettlementPage } from "./settlements";

test("cursor expenses match complete server sorting for ties, nulls, directions and filters", async () => {
	const { client, ctx } = await paginationFixture();
	try {
		for (const sortBy of [
			"date",
			"description",
			"payer",
			"category",
			"amountMinor",
		] as const) {
			for (const sortDirection of ["asc", "desc"] as const) {
				const input = { groupId: "G", sortBy, sortDirection };
				const expected = await listExpenses(ctx, {
					...input,
					offset: 0,
					limit: 100,
				});
				const ids: string[] = [];
				let cursor: string | undefined;
				do {
					const page = await listExpensePage(ctx, {
						...input,
						cursor,
						limit: 12,
					});
					assert.equal(page.items.length, 12);
					assert.ok(!("shares" in page.items[0]));
					ids.push(...page.items.map((row) => row.id));
					cursor = page.nextCursor ?? undefined;
					assert.ok(ids.length <= 96, "pagination must terminate");
				} while (cursor);
				assert.deepEqual(
					ids,
					expected.items.map((row) => row.id),
					`${sortBy} ${sortDirection}`,
				);
			}
		}
		const filter = {
			groupId: "G",
			participant: "B",
			paidBy: "A",
			currency: "USD",
			search: "MEAL 3",
		};
		const page = await listExpensePage(ctx, { ...filter, limit: 100 });
		assert.deepEqual(
			page.items.map((row) => row.id),
			(await listExpenses(ctx, { ...filter, limit: 100 })).items.map(
				(row) => row.id,
			),
		);
		const cursor = (await listExpensePage(ctx, { groupId: "G", limit: 1 }))
			.nextCursor;
		assert.ok(cursor);
		for (const changed of [
			{ groupId: "other" },
			{ search: "meal" },
			{ sortDirection: "asc" as const },
			{ currency: "USD" },
		])
			await assert.rejects(
				listExpensePage(ctx, { groupId: "G", ...changed, cursor }),
				/Invalid cursor/,
			);
		for (const invalid of [
			"bad",
			"!",
			"x".repeat(2001),
			Buffer.from("{}").toString("base64url"),
		])
			await assert.rejects(
				listExpensePage(ctx, { groupId: "G", cursor: invalid }),
				/Invalid cursor/,
			);
		await ctx.db
			.delete(schema.member)
			.where(
				and(
					eq(schema.member.organizationId, "G"),
					eq(schema.member.userId, "A"),
				),
			);
		await assert.rejects(listExpensePage(ctx, { groupId: "G", cursor }));
	} finally {
		client.close();
	}
});

test("activity and settlement continuations follow timestamp/id order and exact terminal pages", async () => {
	const { client, db, ctx, at } = await paginationFixture(1);
	try {
		const events = ["z", "a", "y", "b", "x", "c"].map((id, i) => ({
			id,
			organizationId: "G",
			actorUserId: "A",
			type: "group.created" as const,
			targetType: "group",
			targetId: "G",
			createdAt: new Date(at.getTime() + Math.floor(i / 2) * 1000),
		}));
		await db.insert(schema.activity).values(events);
		await db.insert(schema.activityRecipient).values(
			events.map((row, i) => ({
				activityId: row.id,
				userId: "A",
				createdAt: new Date(row.createdAt.getTime() + (i % 2) * 13),
			})),
		);
		await db.insert(schema.settlement).values(
			events.map((row) => ({
				id: row.id,
				organizationId: "G",
				fromUserId: "A",
				toUserId: "B",
				createdByUserId: "A",
				amountMinor: 1,
				currency: "USD",
				createdAt: row.createdAt,
			})),
		);
		for (const list of [listActivity, listSettlementPage, listMyActivity]) {
			const ids: string[] = [];
			let cursor: string | undefined;
			for (let i = 0; i < 3; i++) {
				const page = await list(ctx, { groupId: "G", limit: 2, cursor });
				assert.equal(page.items.length, 2);
				ids.push(...page.items.map((row) => row.id));
				cursor = page.nextCursor ?? undefined;
				assert.equal(Boolean(cursor), i < 2);
			}
			assert.equal(new Set(ids).size, 6);
			assert.deepEqual(
				ids,
				list === listMyActivity
					? ["c", "x", "b", "y", "a", "z"]
					: ["x", "c", "y", "b", "z", "a"],
			);
		}
	} finally {
		client.close();
	}
});

test("SQL financial totals equal the full-history calculator including allocated remainders", async () => {
	const { client, db, ctx, users, at } = await paginationFixture();
	try {
		await db.insert(schema.settlement).values([
			{
				id: "s1",
				organizationId: "G",
				fromUserId: "A",
				toUserId: "B",
				createdByUserId: "A",
				amountMinor: 173,
				currency: "USD",
				createdAt: at,
			},
			{
				id: "s2",
				organizationId: "G",
				fromUserId: "C",
				toUserId: "A",
				createdByUserId: "C",
				amountMinor: 89,
				currency: "INR",
				createdAt: at,
			},
		]);
		await db.insert(schema.settlementAllocation).values([
			{
				id: "alloc1",
				settlementId: "s1",
				expenseShareId: "E000000-A",
				amountMinor: 41,
			},
			{
				id: "alloc2",
				settlementId: "s1",
				expenseShareId: "E000000-B",
				amountMinor: 32,
			},
		]);
		const members = users.map((row) => ({
			userId: row.id,
			name: row.name,
			image: row.image,
		}));
		const expected = computeBalances(
			members,
			await db.query.expense.findMany({ with: { shares: true } }),
			await db.query.settlement.findMany({ with: { allocations: true } }),
		);
		assert.deepEqual(
			(await readBalances(ctx.db, "G", members)).members,
			expected,
		);
		assert.deepEqual(
			(await readBalances(ctx.db, "other", members)).members,
			[],
		);
	} finally {
		client.close();
	}
});

test("default expense seek uses the composite index without an offset or temporary sort", async () => {
	const { client } = await paginationFixture();
	try {
		const plan = await client.execute({
			sql: "EXPLAIN QUERY PLAN SELECT id FROM expense WHERE organization_id = ? AND (date, created_at, id) < (?, ?, ?) ORDER BY date DESC, created_at DESC, id DESC LIMIT 31",
			args: ["G", 9999999999, 9999999999, "z"],
		});
		const details = plan.rows.map((row) => String(row.detail)).join("\n");
		assert.match(details, /expense_page_idx/);
		assert.match(details, /SEARCH/);
		assert.doesNotMatch(details, /TEMP B-TREE/);
	} finally {
		client.close();
	}
});
