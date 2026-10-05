import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { categoryRule, expense } from "#/db/schema";
import { builtInCategory, normalizeSearchText } from "#/lib/categories";
import type { Ctx } from "#/server/context";
import { AppError } from "#/server/errors";
import {
	applyCategoriesSchema,
	categoryBackfillSchema,
	createCategoryRuleSchema,
	updateCategoryRuleSchema,
} from "#/server/schemas/expenses";
import { id, membership, requirePermission } from "./shared";

export { normalizeSearchText };

type Rule = Pick<
	typeof categoryRule.$inferSelect,
	"id" | "pattern" | "category" | "priority"
>;

/** Group rules are literal substring matches; defaults match whole words/phrases. */
export function categorizeDescription(
	description: string,
	rules: readonly Rule[] = [],
) {
	const text = normalizeSearchText(description);
	const sorted = [...rules].sort(
		(a, b) =>
			b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
	);
	for (const rule of sorted) {
		const pattern = normalizeSearchText(rule.pattern);
		if (pattern && text.includes(pattern))
			return {
				category: rule.category,
				source: "rule" as const,
				ruleId: rule.id,
				pattern: rule.pattern,
			};
	}
	const builtIn = builtInCategory(text);
	if (builtIn)
		return {
			category: builtIn.category,
			source: "default" as const,
			ruleId: null,
			pattern: builtIn.keyword,
		};
	return {
		category: "Other",
		source: "fallback" as const,
		ruleId: null,
		pattern: null,
	};
}

export async function listCategoryRules(ctx: Ctx, input: { groupId: string }) {
	await membership(ctx, input.groupId);
	return ctx.db
		.select()
		.from(categoryRule)
		.where(eq(categoryRule.organizationId, input.groupId))
		.orderBy(desc(categoryRule.priority), asc(categoryRule.id));
}

export async function suggestCategory(
	ctx: Ctx,
	input: { groupId: string; description: string },
) {
	return categorizeDescription(
		input.description,
		await listCategoryRules(ctx, input),
	);
}

/**
 * Existing expenses whose category the current rules would change. With a
 * `ruleId`, only the ones that rule decides. Without one, a description that
 * matches nothing never replaces a category someone already picked by hand.
 */
export async function previewCategoryBackfill(
	ctx: Ctx,
	raw: Parameters<typeof categoryBackfillSchema.parse>[0],
) {
	const input = categoryBackfillSchema.parse(raw);
	const rules = await listCategoryRules(ctx, input);
	if (input.ruleId && !rules.some((rule) => rule.id === input.ruleId))
		throw new AppError("NOT_FOUND", "Category rule not found");
	const rows = await ctx.db
		.select({
			id: expense.id,
			description: expense.description,
			category: expense.category,
			amountMinor: expense.amountMinor,
			currency: expense.currency,
			date: expense.date,
		})
		.from(expense)
		.where(eq(expense.organizationId, input.groupId))
		.orderBy(desc(expense.date), desc(expense.id));
	const changes = [];
	for (const row of rows) {
		const suggestion = categorizeDescription(row.description, rules);
		if (suggestion.category === row.category) continue;
		if (
			input.ruleId
				? suggestion.ruleId !== input.ruleId
				: suggestion.source === "fallback" && row.category
		)
			continue;
		changes.push({
			expenseId: row.id,
			description: row.description,
			date: row.date,
			amountMinor: row.amountMinor,
			currency: row.currency,
			currentCategory: row.category,
			category: suggestion.category,
			source: suggestion.source,
			pattern: suggestion.pattern,
		});
	}
	return { changes };
}

/** Category is bookkeeping, so it changes even on expenses with paid shares. */
async function writeCategories(
	ctx: Ctx,
	groupId: string,
	changes: readonly { expenseId: string; category: string }[],
) {
	const wanted = new Map(
		changes.map((change) => [change.expenseId, change.category]),
	);
	if (!wanted.size) return { updated: 0 };
	return ctx.db.transaction(async (tx) => {
		const rows = await tx
			.select({
				id: expense.id,
				description: expense.description,
				notes: expense.notes,
				category: expense.category,
			})
			.from(expense)
			.where(
				and(
					eq(expense.organizationId, groupId),
					inArray(expense.id, [...wanted.keys()]),
				),
			);
		const now = new Date();
		let updated = 0;
		for (const row of rows) {
			const category = wanted.get(row.id);
			if (!category || category === row.category) continue;
			await tx
				.update(expense)
				.set({
					category,
					searchText: normalizeSearchText(row.description, row.notes, category),
					updatedAt: now,
				})
				.where(eq(expense.id, row.id));
			updated++;
		}
		return { updated };
	});
}

export async function applyCategories(
	ctx: Ctx,
	raw: Parameters<typeof applyCategoriesSchema.parse>[0],
) {
	const input = applyCategoriesSchema.parse(raw);
	await membership(ctx, input.groupId);
	return writeCategories(ctx, input.groupId, input.changes);
}

export async function createCategoryRule(
	ctx: Ctx,
	raw: Parameters<typeof createCategoryRuleSchema.parse>[0],
) {
	const input = createCategoryRuleSchema.parse(raw);
	requirePermission((await membership(ctx, input.groupId)).role, {
		category: ["create"],
	});
	const [row] = await ctx.db
		.insert(categoryRule)
		.values({
			id: id(),
			organizationId: input.groupId,
			pattern: normalizeSearchText(input.pattern),
			category: input.category,
			priority: input.priority,
		})
		.returning();
	if (!input.applyToExisting) return { ...row, recategorized: 0 };
	const { changes } = await previewCategoryBackfill(ctx, {
		groupId: input.groupId,
		ruleId: row.id,
	});
	const { updated } = await writeCategories(ctx, input.groupId, changes);
	return { ...row, recategorized: updated };
}

export async function updateCategoryRule(
	ctx: Ctx,
	raw: Parameters<typeof updateCategoryRuleSchema.parse>[0],
) {
	const input = updateCategoryRuleSchema.parse(raw);
	requirePermission((await membership(ctx, input.groupId)).role, {
		category: ["update"],
	});
	const [row] = await ctx.db
		.update(categoryRule)
		.set({
			pattern: normalizeSearchText(input.pattern),
			category: input.category,
			priority: input.priority,
		})
		.where(
			and(
				eq(categoryRule.id, input.ruleId),
				eq(categoryRule.organizationId, input.groupId),
			),
		)
		.returning();
	if (!row) throw new AppError("NOT_FOUND", "Category rule not found");
	return row;
}

export async function deleteCategoryRule(
	ctx: Ctx,
	input: { groupId: string; ruleId: string },
) {
	requirePermission((await membership(ctx, input.groupId)).role, {
		category: ["delete"],
	});
	const rows = await ctx.db
		.delete(categoryRule)
		.where(
			and(
				eq(categoryRule.id, input.ruleId),
				eq(categoryRule.organizationId, input.groupId),
			),
		)
		.returning({ id: categoryRule.id });
	if (!rows.length) throw new AppError("NOT_FOUND", "Category rule not found");
	return { success: true };
}
