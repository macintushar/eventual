import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import { instrumentDatabase } from "#/server/performance";

/** Deterministic local-only history for correctness and scale measurements. */
export async function paginationFixture(count = 96, url = ":memory:") {
	const client = createClient({ url });
	const db = drizzle(instrumentDatabase(client), { schema });
	await migrate(db, { migrationsFolder: "./drizzle" });
	const at = new Date("2026-09-01T00:00:00Z");
	const users = ["A", "B", "C"].map((id) => ({
		id,
		name: id === "A" ? "Zoe" : id === "B" ? "amy" : "Pat",
		email: `${id.toLowerCase()}@pagination.invalid`,
		emailVerified: true,
		image: null,
		createdAt: at,
		updatedAt: at,
	}));
	await db.insert(schema.user).values(users);
	await db
		.insert(schema.organization)
		.values(
			["G", "other"].map((id) => ({ id, name: id, slug: id, createdAt: at })),
		);
	await db.insert(schema.member).values(
		users.flatMap((person) =>
			["G", "other"].map((group) => ({
				id: `${group}-${person.id}`,
				organizationId: group,
				userId: person.id,
				role: "owner",
				createdAt: at,
			})),
		),
	);
	for (let start = 0; start < count; start += 50) {
		const expenses = Array.from(
			{ length: Math.min(50, count - start) },
			(_, offset) => {
				const i = start + offset;
				return {
					id: `E${String(i).padStart(6, "0")}`,
					organizationId: "G",
					description: `Meal ${i % 9}`,
					searchText: `meal ${i % 9}`,
					category: i % 4 ? (i % 2 ? "Food" : "food") : null,
					amountMinor: 300,
					currency: i % 3 ? "INR" : "USD",
					paidByUserId: users[i % 3].id,
					splitMethod: "even" as const,
					date: new Date(at.getTime() + (i % 5) * 86_400_000),
					createdAt: new Date(at.getTime() + (i % 7) * 1000),
					updatedAt: at,
					createdByUserId: "A",
				};
			},
		);
		await db.insert(schema.expense).values(expenses);
		await db.insert(schema.expenseShare).values(
			expenses.flatMap((row, index) =>
				users.map((person) => ({
					id: `${row.id}-${person.id}`,
					expenseId: row.id,
					userId: person.id,
					amountMinor: 100,
					paidAt: index % 5 === 0 ? at : null,
				})),
			),
		);
	}
	const ctx = { db, user: users[0] } as Ctx;
	return { client, db, ctx, at, users };
}
