import { z } from "zod";

import type { Ctx } from "#/server/context";
import { measuredOperation } from "#/server/measured-operation";
import {
	assignableRoleSchema,
	createExpenseSchema,
	createGroupSchema,
	createSettlementSchema,
	expenseIdSchema,
	groupIdSchema,
	invitationIdSchema,
	inviteSchema,
	leaveGroupSchema,
	memberActionSchema,
	pageSchema,
	quickExpenseSchema,
	settlementIdSchema,
	updateExpenseSchema,
	updateGroupSchema,
} from "#/server/schemas";
import {
	createRecurringExpenseSchema,
	deleteRecurringExpenseSchema,
	getReminderPreferencesSchema,
	listRecurringExpensesSchema,
	listRemindersSchema,
	reminderPreferencesSchema,
	scheduleReminderSchema,
	updateRecurringExpenseSchema,
} from "#/server/schemas/automation";
import {
	bulkResplitSchema,
	categoryRulesSchema,
	createCategoryRuleSchema,
	deleteCategoryRuleSchema,
	expensePageSchema,
	expenseReportSchema,
	listExpensesSchema,
	previewGroupExpenseSchema,
	suggestCategorySchema,
	updateCategoryRuleSchema,
} from "#/server/schemas/expenses";
import {
	archiveGroupSchema,
	crossGroupBalancesSchema,
	duplicateGroupSchema,
	paymentIntentsSchema,
	unarchiveGroupSchema,
} from "#/server/schemas/groups";
import {
	addMemberSchema,
	mergeGuestSchema,
	updateMemberWeightSchema,
} from "#/server/schemas/people";
import * as services from "#/server/services/app";
import * as shortcut from "#/server/services/shortcut";

export type OperationSurface = "web" | "rest" | "mcp" | "shortcut";
export type OperationMethod = "GET" | "POST" | "PATCH" | "DELETE";

type OperationDefinition = {
	name: string;
	kind: "read" | "mutation";
	method: OperationMethod;
	path: `/v1/${string}` | `/v2/${string}`;
	input: z.ZodType;
	output: z.ZodType;
	scope: string;
	idempotent?: boolean;
	auth?: boolean;
	mcp?: { tool: string; description: string; input?: z.ZodObject };
	preset?: { legacyPath: string };
	handler: (ctx: never, input: never) => unknown;
};

const defineOperation = <const Operation extends OperationDefinition>(
	operation: Operation,
) => operation;
const output = z.unknown();
const empty = z.object({});
const activitySchema = pageSchema;
const myPageSchema = pageSchema.omit({ groupId: true });
const renameSchema = updateGroupSchema;
const memberRoleSchema = memberActionSchema.extend({
	role: assignableRoleSchema,
});
const sharePaidSchema = memberActionSchema.omit({ groupId: true }).extend({
	expenseId: z.string().min(1),
	// Bodyless `POST .../paid` predates the explicit flag and means "mark paid".
	paid: z.boolean().default(true),
});
const shortcutCreateSchema = quickExpenseSchema;

export const operations = [
	defineOperation({
		name: "expense.page",
		kind: "read",
		method: "GET",
		path: "/v2/groups/:groupId/expenses",
		input: expensePageSchema,
		output,
		scope: "expense:read",
		mcp: {
			tool: "listExpensePage",
			description:
				"Cursor-paginated compact expenses. Pass nextCursor with identical filters and sort. Payer-name sorting is best-effort across renames.",
		},
		handler: services.listExpensePage,
	}),
	defineOperation({
		name: "settlement.page",
		kind: "read",
		method: "GET",
		path: "/v2/groups/:groupId/settlements",
		input: pageSchema,
		output,
		scope: "settlement:read",
		mcp: {
			tool: "listSettlementPage",
			description: "Cursor-paginated settlement history with compact parties.",
		},
		handler: services.listSettlementPage,
	}),
	defineOperation({
		name: "group.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups",
		input: empty,
		output,
		scope: "group:read",
		mcp: {
			tool: "listGroups",
			description: "List the signed-in user's groups",
		},
		handler: (ctx) => services.listGroups(ctx),
	}),
	defineOperation({
		name: "group.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups",
		input: createGroupSchema,
		output,
		scope: "group:create",
		idempotent: true,
		handler: services.createGroup,
	}),
	defineOperation({
		name: "group.get",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId",
		input: groupIdSchema,
		output,
		scope: "group:read",
		handler: services.getGroup,
	}),
	defineOperation({
		name: "group.rename",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/groups/:groupId",
		input: renameSchema,
		output,
		scope: "group:update",
		idempotent: true,
		handler: services.renameGroup,
	}),
	defineOperation({
		name: "group.delete",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/groups/:groupId",
		input: groupIdSchema,
		output,
		scope: "group:delete",
		idempotent: true,
		handler: services.deleteGroup,
	}),
	defineOperation({
		name: "group.leave",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/leave",
		input: leaveGroupSchema,
		output,
		scope: "member:delete",
		idempotent: true,
		handler: services.leaveGroup,
	}),
	defineOperation({
		name: "group.archive",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/archive",
		input: archiveGroupSchema,
		output,
		scope: "group:update",
		idempotent: true,
		handler: services.archiveGroup,
	}),
	defineOperation({
		name: "group.unarchive",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/unarchive",
		input: unarchiveGroupSchema,
		output,
		scope: "group:update",
		idempotent: true,
		handler: services.unarchiveGroup,
	}),
	defineOperation({
		name: "group.duplicate",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/duplicate",
		input: duplicateGroupSchema,
		output,
		scope: "group:update",
		idempotent: true,
		handler: services.duplicateGroup,
	}),

	defineOperation({
		name: "member.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/members",
		input: groupIdSchema,
		output,
		scope: "member:read",
		handler: services.listMembers,
	}),
	defineOperation({
		name: "member.add",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/members",
		input: addMemberSchema,
		output,
		scope: "member:create",
		idempotent: true,
		handler: services.addMember,
	}),
	defineOperation({
		name: "member.role",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/groups/:groupId/members/:userId",
		input: memberRoleSchema,
		output,
		scope: "member:role",
		idempotent: true,
		handler: services.updateMemberRole,
	}),
	defineOperation({
		name: "member.remove",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/groups/:groupId/members/:userId",
		input: memberActionSchema,
		output,
		scope: "member:delete",
		idempotent: true,
		handler: services.removeMember,
	}),
	defineOperation({
		name: "member.weight",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/groups/:groupId/members/:userId/weight",
		input: updateMemberWeightSchema,
		output,
		scope: "member:update",
		idempotent: true,
		handler: services.updateMemberWeight,
	}),
	defineOperation({
		name: "member.merge",
		kind: "mutation",
		method: "POST",
		path: "/v1/members/merge",
		input: mergeGuestSchema,
		output,
		scope: "member:delete",
		idempotent: true,
		handler: services.mergeGuest,
	}),

	defineOperation({
		name: "invitation.mine",
		kind: "read",
		method: "GET",
		path: "/v1/me/invitations",
		input: empty,
		output,
		scope: "invitation:read",
		handler: (ctx) => services.listMyInvitations(ctx),
	}),
	defineOperation({
		name: "invitation.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/invitations",
		input: groupIdSchema,
		output,
		scope: "invitation:read",
		handler: services.listInvitations,
	}),
	defineOperation({
		name: "invitation.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/invitations",
		input: inviteSchema,
		output,
		scope: "invitation:create",
		idempotent: true,
		handler: services.createInvitation,
	}),
	defineOperation({
		name: "invitation.get",
		kind: "read",
		method: "GET",
		path: "/v1/invitations/:invitationId",
		input: invitationIdSchema,
		output,
		scope: "public",
		auth: false,
		handler: (_ctx, input) => services.getInvitation(null, input),
	}),
	defineOperation({
		name: "invitation.revoke",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/invitations/:invitationId",
		input: invitationIdSchema,
		output,
		scope: "invitation:cancel",
		idempotent: true,
		handler: services.revokeInvitation,
	}),
	defineOperation({
		name: "invitation.accept",
		kind: "mutation",
		method: "POST",
		path: "/v1/invitations/:invitationId/accept",
		input: invitationIdSchema,
		output,
		scope: "invitation:accept",
		idempotent: true,
		handler: services.acceptInvitation,
	}),

	defineOperation({
		name: "expense.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/expenses",
		input: listExpensesSchema,
		output,
		scope: "expense:read",
		mcp: {
			tool: "listExpenses",
			description: "List and search expenses in a group",
		},
		handler: services.listExpenses,
	}),
	defineOperation({
		name: "expense.get",
		kind: "read",
		method: "GET",
		path: "/v1/expenses/:expenseId",
		input: expenseIdSchema,
		output,
		scope: "expense:read",
		handler: services.getExpense,
	}),
	defineOperation({
		name: "expense.preview",
		kind: "read",
		method: "POST",
		path: "/v1/groups/:groupId/expenses/preview",
		input: previewGroupExpenseSchema,
		output,
		scope: "expense:read",
		handler: services.previewGroupExpense,
	}),
	defineOperation({
		name: "expense.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/expenses",
		input: createExpenseSchema,
		output,
		scope: "expense:create",
		idempotent: true,
		mcp: {
			tool: "createExpense",
			description: "Create and split an expense in its original currency",
		},
		handler: services.createExpense,
	}),
	defineOperation({
		name: "expense.update",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/expenses/:expenseId",
		input: updateExpenseSchema,
		output,
		scope: "expense:update",
		idempotent: true,
		handler: services.updateExpense,
	}),
	defineOperation({
		name: "expense.delete",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/expenses/:expenseId",
		input: expenseIdSchema,
		output,
		scope: "expense:delete",
		idempotent: true,
		handler: services.deleteExpense,
	}),
	defineOperation({
		name: "expense.resplit",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/expenses/resplit",
		input: bulkResplitSchema,
		output,
		scope: "expense:update",
		idempotent: true,
		handler: services.bulkResplitExpenses,
	}),
	defineOperation({
		name: "expense.report",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/reports/expenses",
		input: expenseReportSchema,
		output,
		scope: "expense:read",
		handler: services.expenseReport,
	}),
	defineOperation({
		name: "share.paid",
		kind: "mutation",
		method: "POST",
		path: "/v1/expenses/:expenseId/shares/:userId/paid",
		input: sharePaidSchema,
		output,
		scope: "expense:update",
		idempotent: true,
		handler: (ctx: Ctx, input: z.infer<typeof sharePaidSchema>) =>
			services.setSharePaid(ctx, input, input.paid),
	}),
	defineOperation({
		name: "share.unpaid",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/expenses/:expenseId/shares/:userId/paid",
		input: sharePaidSchema.omit({ paid: true }),
		output,
		scope: "expense:update",
		idempotent: true,
		handler: (ctx, input) => services.setSharePaid(ctx, input, false),
	}),

	defineOperation({
		name: "category.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/categories",
		input: categoryRulesSchema,
		output,
		scope: "category:read",
		handler: services.listCategoryRules,
	}),
	defineOperation({
		name: "category.suggest",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/categories/suggest",
		input: suggestCategorySchema,
		output,
		scope: "category:read",
		handler: services.suggestCategory,
	}),
	defineOperation({
		name: "category.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/categories",
		input: createCategoryRuleSchema,
		output,
		scope: "category:create",
		idempotent: true,
		handler: services.createCategoryRule,
	}),
	defineOperation({
		name: "category.update",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/groups/:groupId/categories/:ruleId",
		input: updateCategoryRuleSchema,
		output,
		scope: "category:update",
		idempotent: true,
		handler: services.updateCategoryRule,
	}),
	defineOperation({
		name: "category.delete",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/groups/:groupId/categories/:ruleId",
		input: deleteCategoryRuleSchema,
		output,
		scope: "category:delete",
		idempotent: true,
		handler: services.deleteCategoryRule,
	}),

	defineOperation({
		name: "balance.get",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/balances",
		input: groupIdSchema,
		output,
		scope: "balance:read",
		mcp: {
			tool: "getBalances",
			description: "Get balances and simplified transfers per currency",
		},
		handler: services.getBalances,
	}),
	defineOperation({
		name: "balance.crossGroup",
		kind: "read",
		method: "GET",
		path: "/v1/me/balances",
		input: crossGroupBalancesSchema,
		output,
		scope: "balance:read",
		handler: (ctx) => services.getCrossGroupBalances(ctx),
	}),
	defineOperation({
		name: "payment.intents",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/payment-intents",
		input: paymentIntentsSchema,
		output,
		scope: "balance:read",
		handler: services.getPaymentIntents,
	}),
	defineOperation({
		name: "settlement.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/settlements",
		input: groupIdSchema,
		output,
		scope: "settlement:read",
		handler: services.listSettlements,
	}),
	defineOperation({
		name: "settlement.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/settlements",
		input: createSettlementSchema,
		output,
		scope: "settlement:create",
		idempotent: true,
		handler: services.createSettlement,
	}),
	defineOperation({
		name: "settlement.delete",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/settlements/:settlementId",
		input: settlementIdSchema,
		output,
		scope: "settlement:delete",
		idempotent: true,
		handler: services.deleteSettlement,
	}),

	defineOperation({
		name: "activity.group",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/activity",
		input: activitySchema,
		output,
		scope: "activity:read",
		handler: services.listActivity,
	}),
	defineOperation({
		name: "activity.mine",
		kind: "read",
		method: "GET",
		path: "/v1/me/activity",
		input: myPageSchema,
		output,
		scope: "activity:read",
		handler: services.listMyActivity,
	}),
	defineOperation({
		name: "reminder.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/reminders",
		input: listRemindersSchema,
		output,
		scope: "reminder:read",
		handler: services.listReminders,
	}),
	defineOperation({
		name: "reminder.schedule",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/reminders",
		input: scheduleReminderSchema,
		output,
		scope: "reminder:create",
		idempotent: true,
		handler: services.scheduleReminder,
	}),
	defineOperation({
		name: "reminder.preferences.get",
		kind: "read",
		method: "GET",
		path: "/v1/me/reminder-preferences",
		input: getReminderPreferencesSchema,
		output,
		scope: "reminder:read",
		handler: (ctx) => services.getReminderPreferences(ctx),
	}),
	defineOperation({
		name: "reminder.preferences.update",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/me/reminder-preferences",
		input: reminderPreferencesSchema,
		output,
		scope: "reminder:update",
		idempotent: true,
		handler: services.updateReminderPreferences,
	}),
	defineOperation({
		name: "recurring.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/recurring-expenses",
		input: listRecurringExpensesSchema,
		output,
		scope: "expense:read",
		handler: services.listRecurringExpenses,
	}),
	defineOperation({
		name: "recurring.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/recurring-expenses",
		input: createRecurringExpenseSchema,
		output,
		scope: "expense:create",
		idempotent: true,
		handler: services.createRecurringExpense,
	}),
	defineOperation({
		name: "recurring.update",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/recurring-expenses/:templateId",
		input: updateRecurringExpenseSchema,
		output,
		scope: "expense:update",
		idempotent: true,
		handler: services.updateRecurringExpense,
	}),
	defineOperation({
		name: "recurring.delete",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/recurring-expenses/:templateId",
		input: deleteRecurringExpenseSchema,
		output,
		scope: "expense:delete",
		idempotent: true,
		handler: services.deleteRecurringExpense,
	}),

	defineOperation({
		name: "preset.shortcut.groups",
		kind: "read",
		method: "GET",
		path: "/v1/presets/shortcut/groups",
		input: empty,
		output,
		scope: "group:read",
		preset: { legacyPath: "/shortcut/groups" },
		handler: (ctx) => shortcut.shortcutGroups(ctx),
	}),
	defineOperation({
		name: "preset.shortcut.members",
		kind: "read",
		method: "GET",
		path: "/v1/presets/shortcut/groups/:groupId/members",
		input: groupIdSchema,
		output,
		scope: "member:read",
		preset: { legacyPath: "/shortcut/groups/:groupId/members" },
		handler: shortcut.shortcutMembers,
	}),
	defineOperation({
		name: "preset.shortcut.expense",
		kind: "mutation",
		method: "POST",
		path: "/v1/presets/shortcut/groups/:groupId/expenses",
		input: shortcutCreateSchema,
		output,
		scope: "expense:create",
		idempotent: true,
		preset: { legacyPath: "/shortcut/groups/:groupId/expenses" },
		handler: shortcut.quickExpense,
	}),
] as const;

export type Operation = (typeof operations)[number];
export type OperationName = Operation["name"];
export type MutationOperation = Extract<Operation, { kind: "mutation" }>;
export type MutationInput = MutationOperation extends infer Item
	? Item extends {
			name: infer Name extends string;
			input: infer Schema extends z.ZodType;
		}
		? { action: Name; input: z.infer<Schema> }
		: never
	: never;

export const operationByName = new Map<OperationName, Operation>(
	operations.map((operation) => [operation.name, operation]),
);

const mutationOptions = operations
	.filter((operation) => operation.kind === "mutation")
	.map((operation) =>
		z.object({ action: z.literal(operation.name), input: operation.input }),
	);

export const mutationSchema = z.union(
	mutationOptions as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]],
) as z.ZodType<MutationInput>;

export async function invokeOperation(
	operation: Operation,
	ctx: Ctx | null,
	input: unknown,
) {
	const parsed = operation.input.parse(input);
	return operation.handler(ctx as never, parsed as never);
}

export async function executeOperation(
	operation: Operation,
	ctx: Ctx,
	input: unknown,
	surface: OperationSurface,
) {
	return measuredOperation(ctx, operation.name, surface, async () =>
		invokeOperation(operation, ctx, input),
	);
}
