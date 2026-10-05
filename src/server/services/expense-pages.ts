import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import { expense, expenseShare, user } from "#/db/schema";
import type { Ctx } from "#/server/context";
import {
	cursorScope,
	decodePageCursor,
	encodePageCursor,
	pageLimit,
} from "#/server/pagination";
import type { ExpenseFilters, ExpenseSortBy } from "#/server/schemas/expenses";
import { normalizeSearchText } from "./categories";
import { expenseFilterClauses } from "./expenses";
import { membership } from "./shared";

export async function listExpensePage(
	ctx: Ctx,
	input: ExpenseFilters & {
		cursor?: string;
		limit?: number;
		sortBy?: ExpenseSortBy;
		sortDirection?: "asc" | "desc";
	},
) {
	await membership(ctx, input.groupId);
	const limit = pageLimit(input.limit);
	const sort = input.sortBy ?? "date";
	const direction = input.sortDirection ?? "desc";
	const scope = cursorScope([
		"expenses",
		input.groupId,
		input.paidBy,
		input.participant,
		input.from?.getTime(),
		input.to?.getTime(),
		input.category,
		input.currency,
		normalizeSearchText(input.search),
		sort,
		direction,
	]);
	// Raw seconds match SQLite timestamp storage exactly (recipients use ms instead).
	const date = sql<number>`${expense.date}`;
	const created = sql<number>`${expense.createdAt}`;
	const primary =
		sort === "description"
			? sql<string>`lower(${expense.description})`
			: sort === "payer"
				? sql<string>`lower(${user.name})`
				: sort === "category"
					? sql<string>`coalesce(lower(${expense.category}), '')`
					: sort === "amountMinor"
						? sql<number>`${expense.amountMinor}`
						: date;
	const rank = sql<number>`case when ${expense.category} is null then 1 else 0 end`;
	const order: {
		value: SQL;
		direction: "asc" | "desc";
		type: "string" | "number";
	}[] = [
		...(sort === "category"
			? [{ value: rank, direction: "asc" as const, type: "number" as const }]
			: []),
		{
			value: primary,
			direction,
			type: sort === "date" || sort === "amountMinor" ? "number" : "string",
		},
		...(sort === "date"
			? []
			: [{ value: date, direction: "desc" as const, type: "number" as const }]),
		{ value: created, direction: "desc", type: "number" },
		{ value: sql`${expense.id}`, direction: "desc", type: "string" },
	];
	const clauses = expenseFilterClauses(input);
	if (input.cursor) {
		const values = decodePageCursor(
			input.cursor,
			scope,
			order.map((item) => item.type),
		);
		// A row-value seek lets SQLite start at the indexed boundary, even deep in history.
		if (sort === "date" && direction === "desc") {
			clauses.push(
				sql`(${expense.date}, ${expense.createdAt}, ${expense.id}) < (${values[0]}, ${values[1]}, ${values[2]})`,
			);
		} else {
			clauses.push(
				sql`(${sql.join(
					order.map(
						(item, index) =>
							and(
								...order
									.slice(0, index)
									.map((prior, j) => sql`${prior.value} = ${values[j]}`),
								sql`${item.value} ${sql.raw(item.direction === "asc" ? ">" : "<")} ${values[index]}`,
							)!,
					),
					sql` or `,
				)})`,
			);
		}
	}
	const rows = await ctx.db
		.select({
			id: expense.id,
			organizationId: expense.organizationId,
			description: expense.description,
			date: expense.date,
			category: expense.category,
			amountMinor: expense.amountMinor,
			currency: expense.currency,
			payer: { id: user.id, name: user.name, image: user.image },
			locked:
				sql<boolean>`exists(select 1 from ${expenseShare} where ${expenseShare.expenseId} = ${expense.id} and ${expenseShare.paidAt} is not null)`.mapWith(
					Boolean,
				),
			primary,
			rank,
			dateValue: date,
			createdValue: created,
		})
		.from(expense)
		.innerJoin(user, eq(user.id, expense.paidByUserId))
		.where(and(...clauses))
		.orderBy(
			...order.map((item) =>
				item.direction === "asc" ? asc(item.value) : desc(item.value),
			),
		)
		.limit(limit + 1);
	const page = rows.slice(0, limit);
	const last = page.at(-1);
	return {
		items: page.map(
			({
				primary: _primary,
				rank: _rank,
				dateValue: _date,
				createdValue: _created,
				...item
			}) => item,
		),
		nextCursor:
			rows.length > limit && last
				? encodePageCursor(scope, [
						...(sort === "category" ? [last.rank] : []),
						last.primary,
						...(sort === "date" ? [] : [last.dateValue]),
						last.createdValue,
						last.id,
					])
				: null,
	};
}
