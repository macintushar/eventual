import "../instrument.server";
import { and, asc, eq, gt } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "#/db";
import { expense } from "#/db/schema";
import { getAppLogger } from "#/lib/logging";
import { normalizeSearchText } from "#/server/services/categories";

await migrate(db, { migrationsFolder: "drizzle" });
getAppLogger("database", "migration").info("Database migrations applied");

// Migration 0004 added `search_text` as '' for existing expenses. Search only
// reads that column, so backfill it with the same normalization writes use.
// SQL alone can't match NFKC/Unicode lowercasing, hence doing it here.
let backfilled = 0;
let cursor = "";
for (;;) {
	const rows = await db
		.select({
			id: expense.id,
			description: expense.description,
			notes: expense.notes,
			category: expense.category,
		})
		.from(expense)
		.where(and(eq(expense.searchText, ""), gt(expense.id, cursor)))
		.orderBy(asc(expense.id))
		.limit(500);
	if (!rows.length) break;
	cursor = rows[rows.length - 1].id;
	await db.transaction(async (tx) => {
		for (const row of rows) {
			const searchText = normalizeSearchText(
				row.description,
				row.notes,
				row.category,
			);
			if (!searchText) continue;
			await tx
				.update(expense)
				.set({ searchText })
				.where(eq(expense.id, row.id));
			backfilled++;
		}
	});
}
if (backfilled)
	getAppLogger("database", "migration").info(
		"Expense search backfill completed",
		{ expenseCount: backfilled },
	);
