import { z } from "zod";
import { currencies, isCurrency } from "#/lib/currencies";

export const currencySchema = z
	.string()
	.refine(isCurrency, "Unsupported currency")
	.describe(
		`ISO currency code: ${currencies.map((currency) => currency.code).join(", ")}`,
	);

export const idSchema = z.string().min(1);
export const roleSchema = z.enum(["owner", "admin", "member"]);
export const splitMethodSchema = z.enum(["even", "exact", "shares", "percent"]);
export const participantSchema = z.object({
	userId: idSchema,
	input: z.number().int().nullable(),
});
export const createGroupSchema = z.object({
	name: z.string().trim().min(1).max(100),
	slug: z
		.string()
		.trim()
		.min(1)
		.max(100)
		.regex(/^[a-z0-9-]+$/)
		.optional(),
});
export const updateGroupSchema = z.object({
	groupId: idSchema,
	name: z.string().trim().min(1).max(100),
});
export const groupIdSchema = z.object({ groupId: idSchema });
export const expenseIdSchema = z.object({ expenseId: idSchema });
export const invitationIdSchema = z.object({ invitationId: idSchema });
export const createExpenseSchema = z.object({
	groupId: idSchema,
	description: z.string().trim().min(1).max(200),
	notes: z.string().trim().max(2000).nullable().optional(),
	amountMinor: z.number().int().safe().positive(),
	currency: currencySchema.default("INR"),
	paidByUserId: idSchema,
	splitMethod: splitMethodSchema,
	date: z.coerce.date(),
	participants: z.array(participantSchema).min(1),
});
export const updateExpenseSchema = createExpenseSchema
	.omit({ groupId: true })
	.extend({ expenseId: idSchema, currency: currencySchema });
export const previewExpenseSchema = createExpenseSchema.pick({
	amountMinor: true,
	currency: true,
	splitMethod: true,
	participants: true,
});
export const sharePaidSchema = z.object({
	expenseId: idSchema,
	userId: idSchema,
});
export const createSettlementSchema = z.object({
	groupId: idSchema,
	toUserId: idSchema,
	amountMinor: z.number().int().safe().positive(),
	currency: currencySchema,
	note: z.string().trim().max(500).nullable().optional(),
});
export const settlementIdSchema = z.object({ settlementId: idSchema });
export const inviteSchema = z.object({
	groupId: idSchema,
	email: z.string().email(),
	role: roleSchema.default("member"),
});
export const updateMemberSchema = z.object({
	groupId: idSchema,
	userId: idSchema,
	role: roleSchema,
});
export const memberActionSchema = z.object({
	groupId: idSchema,
	userId: idSchema,
});
export const pageSchema = z.object({
	groupId: idSchema,
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** Apple Shortcut quick log: major units in, even split across the whole group. */
export const quickExpenseSchema = z.object({
	groupId: idSchema,
	paidByUserId: idSchema,
	amount: z.union([z.number(), z.string()]),
	currency: currencySchema.default("INR"),
	description: z.string().trim().min(1).max(200).optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
