import { z } from "zod";
import {
	currencySchema,
	idSchema,
	participantSchema,
	previewExpenseSchema,
	splitMethodSchema,
} from "./index";

export const categorySchema = z.string().trim().min(1).max(100);
export const expenseFiltersSchema = z.object({
	groupId: idSchema,
	paidBy: idSchema.optional(),
	participant: idSchema.optional(),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
	category: categorySchema.optional(),
	currency: currencySchema.optional(),
	search: z.string().trim().max(500).optional(),
});
export const expenseSortBySchema = z.enum([
	"description",
	"payer",
	"date",
	"category",
	"amountMinor",
]);
export const listExpensesSchema = expenseFiltersSchema.extend({
	cursor: z.string().max(2000).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(30),
	offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
	/** Epoch ms from the first page's `asOf`, so later pages ignore newer expenses. */
	asOf: z.coerce.number().int().positive().optional(),
	sortBy: expenseSortBySchema.optional(),
	sortDirection: z.enum(["asc", "desc"]).optional(),
});
export const expenseReportSchema = expenseFiltersSchema.extend({
	format: z.enum(["csv", "pdf"]).default("csv"),
});
export const expensePageSchema = listExpensesSchema.omit({
	offset: true,
	asOf: true,
});
export const previewGroupExpenseSchema = previewExpenseSchema.extend({
	groupId: idSchema,
});
export const bulkResplitSchema = z.object({
	groupId: idSchema,
	expenseIds: z.array(idSchema).min(1).max(100),
	splitMethod: splitMethodSchema,
	participants: z.array(participantSchema).min(1),
});
export const categoryRulesSchema = z.object({ groupId: idSchema });
export const createCategoryRuleSchema = categoryRulesSchema.extend({
	/** Literal, case-insensitive phrase, not a regular expression. Higher priority wins. */
	pattern: z.string().trim().min(1).max(200),
	category: categorySchema,
	priority: z.number().int().safe().default(0),
	/** Also recategorize existing expenses this rule now decides. */
	applyToExisting: z.boolean().default(false),
});
export const updateCategoryRuleSchema = createCategoryRuleSchema
	.omit({ applyToExisting: true })
	.extend({ ruleId: idSchema });
export const deleteCategoryRuleSchema = categoryRulesSchema.extend({
	ruleId: idSchema,
});
export const categoryBackfillSchema = categoryRulesSchema.extend({
	/** Only expenses this rule decides; otherwise every rule and built-in keyword. */
	ruleId: idSchema.optional(),
});
export const applyCategoriesSchema = categoryRulesSchema.extend({
	changes: z
		.array(z.object({ expenseId: idSchema, category: categorySchema }))
		.min(1)
		.max(5000),
});
export const suggestCategorySchema = categoryRulesSchema.extend({
	description: z.string().trim().min(1).max(200),
});
export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;
export type ExpenseSortBy = z.infer<typeof expenseSortBySchema>;
export type BulkResplitInput = z.infer<typeof bulkResplitSchema>;
