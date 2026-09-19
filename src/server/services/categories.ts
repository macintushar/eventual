import { and, asc, desc, eq } from "drizzle-orm";
import { categoryRule } from "#/db/schema";
import type { Ctx } from "#/server/context";
import { AppError } from "#/server/errors";
import {
	createCategoryRuleSchema,
	updateCategoryRuleSchema,
} from "#/server/schemas/expenses";
import { id, membership, requireRole } from "./shared";

export function normalizeSearchText(...values: (string | null | undefined)[]) {
	return values
		.filter(Boolean)
		.join(" ")
		.normalize("NFKC")
		.toLowerCase()
		.replace(/\s+/gu, " ")
		.trim();
}

type Rule = Pick<
	typeof categoryRule.$inferSelect,
	"id" | "pattern" | "category" | "priority"
>;
const defaults = [
	[
		"Food & drink",
		[
			"restaurant",
			"dinner",
			"lunch",
			"breakfast",
			"coffee",
			"cafe",
			"takeaway",
		],
	],
	["Groceries", ["groceries", "grocery", "supermarket"]],
	[
		"Transport",
		[
			"taxi",
			"uber",
			"lyft",
			"bus",
			"train",
			"fuel",
			"petrol",
			"parking",
			"flight",
		],
	],
	["Housing", ["rent", "mortgage"]],
	["Utilities", ["electricity", "internet", "wifi", "water bill", "gas bill"]],
	["Travel", ["hotel", "hostel", "airbnb"]],
	["Entertainment", ["cinema", "movie", "concert", "netflix"]],
	["Health", ["pharmacy", "medicine", "doctor", "hospital"]],
] as const;

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
	const words = ` ${text.replace(/[^\p{L}\p{N}]+/gu, " ")} `;
	for (const [category, patterns] of defaults) {
		for (const pattern of patterns)
			if (words.includes(` ${pattern} `))
				return { category, source: "default" as const, ruleId: null, pattern };
	}
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

export async function createCategoryRule(
	ctx: Ctx,
	raw: Parameters<typeof createCategoryRuleSchema.parse>[0],
) {
	const input = createCategoryRuleSchema.parse(raw);
	requireRole((await membership(ctx, input.groupId)).role, ["owner", "admin"]);
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
	return row;
}

export async function updateCategoryRule(
	ctx: Ctx,
	raw: Parameters<typeof updateCategoryRuleSchema.parse>[0],
) {
	const input = updateCategoryRuleSchema.parse(raw);
	requireRole((await membership(ctx, input.groupId)).role, ["owner", "admin"]);
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
	requireRole((await membership(ctx, input.groupId)).role, ["owner", "admin"]);
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
