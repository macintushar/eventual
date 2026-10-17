/**
 * The HTTP contract: every endpoint's name, method, path, input and output.
 *
 * The server attaches a handler to each operation here (see
 * `apps/web/src/server/operations.ts`) and generates OpenAPI from the same
 * list; `@eventual/sdk` builds its typed client from it. Path parameters are
 * fields of the input object, so `{ groupId }` fills `/v1/groups/:groupId`.
 */
import { z } from "zod";
import {
	apiKeySummarySchema,
	createApiKeySchema,
	createdApiKeySchema,
	profileSchema,
} from "./account";
import {
	createRecurringExpenseSchema,
	deleteRecurringExpenseSchema,
	getReminderPreferencesSchema,
	listRecurringExpensesSchema,
	listRemindersSchema,
	reminderPreferencesSchema,
	scheduleReminderSchema,
	updateRecurringExpenseSchema,
} from "./automation";
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
	updateProfileSchema,
} from "./common";
import {
	applyCategoriesSchema,
	bulkResplitSchema,
	categoryBackfillSchema,
	categoryRulesSchema,
	createCategoryRuleSchema,
	deleteCategoryRuleSchema,
	expensePageSchema,
	expenseReportSchema,
	importCategoryRulesSchema,
	listExpensesSchema,
	previewGroupExpenseSchema,
	suggestCategorySchema,
	updateCategoryRuleSchema,
} from "./expenses";
import {
	archiveGroupSchema,
	crossGroupBalancesSchema,
	duplicateGroupSchema,
	paymentIntentsSchema,
	unarchiveGroupSchema,
} from "./groups";
import {
	addMemberResultSchema,
	bulkResplitResultSchema,
	categoryBackfillResultSchema,
	categoryRuleSchema,
	categorySuggestionSchema,
	composerSchema,
	computedShareSchema,
	crossGroupBalanceSchema,
	dashboardSchema,
	expenseDetailSchema,
	expenseListSchema,
	expensePageResultSchema,
	expenseReportFileSchema,
	groupActivityPageSchema,
	groupBalancesSchema,
	groupContextSchema,
	groupDetailSchema,
	groupDirectorySchema,
	groupFinancialSummarySchema,
	groupPageSchema,
	groupSettingsSchema,
	groupSuccessSchema,
	groupSummarySchema,
	healthSchema,
	invitationDeliverySchema,
	invitationDetailSchema,
	invitationRecordSchema,
	legalInfoSchema,
	memberSchema,
	membershipRecordSchema,
	mergeGuestResultSchema,
	myActivityPageSchema,
	paymentIntentsResultSchema,
	pendingVerificationSchema,
	quickExpenseResultSchema,
	recurringExpenseRecordSchema,
	reminderJobSchema,
	reminderPreferencesResultSchema,
	sessionSchema,
	settlementDetailSchema,
	settlementPageResultSchema,
	settlementRecordSchema,
	shortcutMenuSchema,
	siteInfoSchema,
	successSchema,
	updateGuestResultSchema,
	verificationSendSchema,
} from "./outputs";
import {
	addMemberSchema,
	mergeGuestSchema,
	updateGuestSchema,
	updateMemberWeightSchema,
} from "./people";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

type OperationContract = {
	name: string;
	kind: "read" | "mutation";
	method: HttpMethod;
	path: `/v1/${string}` | `/v2/${string}`;
	input: z.ZodType;
	output: z.ZodType;
	scope: string;
	idempotent?: boolean;
	auth?: boolean;
	/** The response is a file download rather than JSON. */
	responseType?: "file";
	mcp?: { tool: string; description: string; input?: z.ZodObject };
	preset?: { legacyPath: string };
};

const defineOperation = <const Operation extends OperationContract>(
	operation: Operation,
) => operation;
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

/**
 * The public REST API: API keys (scoped), bearer tokens and the browser
 * session all reach these, and MCP tools and Shortcut presets reuse them.
 */
export const operationContracts = [
	defineOperation({
		name: "expense.page",
		kind: "read",
		method: "GET",
		path: "/v2/groups/:groupId/expenses",
		input: expensePageSchema,
		output: expensePageResultSchema,
		scope: "expense:read",
		mcp: {
			tool: "listExpensePage",
			description:
				"Cursor-paginated compact expenses. Pass nextCursor with identical filters and sort. Payer-name sorting is best-effort across renames.",
		},
	}),
	defineOperation({
		name: "settlement.page",
		kind: "read",
		method: "GET",
		path: "/v2/groups/:groupId/settlements",
		input: pageSchema,
		output: settlementPageResultSchema,
		scope: "settlement:read",
		mcp: {
			tool: "listSettlementPage",
			description: "Cursor-paginated settlement history with compact parties.",
		},
	}),
	defineOperation({
		name: "group.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups",
		input: empty,
		output: z.array(groupSummarySchema),
		scope: "group:read",
		mcp: {
			tool: "listGroups",
			description: "List the signed-in user's groups",
		},
	}),
	defineOperation({
		name: "group.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups",
		input: createGroupSchema,
		output: groupDetailSchema,
		scope: "group:create",
		idempotent: true,
	}),
	defineOperation({
		name: "group.get",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId",
		input: groupIdSchema,
		output: groupDetailSchema,
		scope: "group:read",
	}),
	defineOperation({
		name: "group.rename",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/groups/:groupId",
		input: renameSchema,
		output: groupDetailSchema,
		scope: "group:update",
		idempotent: true,
	}),
	defineOperation({
		name: "group.delete",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/groups/:groupId",
		input: groupIdSchema,
		output: successSchema,
		scope: "group:delete",
		idempotent: true,
	}),
	defineOperation({
		name: "group.leave",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/leave",
		input: leaveGroupSchema,
		output: successSchema,
		scope: "member:delete",
		idempotent: true,
	}),
	defineOperation({
		name: "group.archive",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/archive",
		input: archiveGroupSchema,
		output: groupDetailSchema,
		scope: "group:update",
		idempotent: true,
	}),
	defineOperation({
		name: "group.unarchive",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/unarchive",
		input: unarchiveGroupSchema,
		output: groupDetailSchema,
		scope: "group:update",
		idempotent: true,
	}),
	defineOperation({
		name: "group.duplicate",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/duplicate",
		input: duplicateGroupSchema,
		output: groupDetailSchema,
		scope: "group:update",
		idempotent: true,
	}),

	defineOperation({
		name: "member.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/members",
		input: groupIdSchema,
		output: z.array(memberSchema),
		scope: "member:read",
	}),
	defineOperation({
		name: "member.add",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/members",
		input: addMemberSchema,
		output: addMemberResultSchema,
		scope: "member:create",
		idempotent: true,
	}),
	defineOperation({
		name: "member.role",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/groups/:groupId/members/:userId",
		input: memberRoleSchema,
		output: successSchema,
		scope: "member:role",
		idempotent: true,
	}),
	defineOperation({
		name: "member.remove",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/groups/:groupId/members/:userId",
		input: memberActionSchema,
		output: successSchema,
		scope: "member:delete",
		idempotent: true,
	}),
	defineOperation({
		name: "member.weight",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/groups/:groupId/members/:userId/weight",
		input: updateMemberWeightSchema,
		output: membershipRecordSchema,
		scope: "member:update",
		idempotent: true,
	}),
	defineOperation({
		name: "member.updateGuest",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/groups/:groupId/guests/:userId",
		input: updateGuestSchema,
		output: updateGuestResultSchema,
		scope: "member:update",
		idempotent: true,
	}),
	defineOperation({
		name: "member.merge",
		kind: "mutation",
		method: "POST",
		path: "/v1/members/merge",
		input: mergeGuestSchema,
		output: mergeGuestResultSchema,
		scope: "member:delete",
		idempotent: true,
	}),

	defineOperation({
		name: "invitation.mine",
		kind: "read",
		method: "GET",
		path: "/v1/me/invitations",
		input: empty,
		output: z.array(invitationDetailSchema),
		scope: "invitation:read",
	}),
	defineOperation({
		name: "invitation.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/invitations",
		input: groupIdSchema,
		output: z.array(invitationRecordSchema),
		scope: "invitation:read",
	}),
	defineOperation({
		name: "invitation.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/invitations",
		input: inviteSchema,
		output: invitationDeliverySchema,
		scope: "invitation:create",
		idempotent: true,
	}),
	defineOperation({
		name: "invitation.get",
		kind: "read",
		method: "GET",
		path: "/v1/invitations/:invitationId",
		input: invitationIdSchema,
		output: invitationDetailSchema,
		scope: "public",
		auth: false,
	}),
	defineOperation({
		name: "invitation.revoke",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/invitations/:invitationId",
		input: invitationIdSchema,
		output: groupSuccessSchema,
		scope: "invitation:cancel",
		idempotent: true,
	}),
	defineOperation({
		name: "invitation.accept",
		kind: "mutation",
		method: "POST",
		path: "/v1/invitations/:invitationId/accept",
		input: invitationIdSchema,
		output: z.object({ groupId: z.string() }),
		scope: "invitation:accept",
		idempotent: true,
	}),

	defineOperation({
		name: "expense.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/expenses",
		input: listExpensesSchema,
		output: expenseListSchema,
		scope: "expense:read",
		mcp: {
			tool: "listExpenses",
			description: "List and search expenses in a group",
		},
	}),
	defineOperation({
		name: "expense.get",
		kind: "read",
		method: "GET",
		path: "/v1/expenses/:expenseId",
		input: expenseIdSchema,
		output: expenseDetailSchema,
		scope: "expense:read",
	}),
	defineOperation({
		name: "expense.preview",
		kind: "read",
		method: "POST",
		path: "/v1/groups/:groupId/expenses/preview",
		input: previewGroupExpenseSchema,
		output: z.array(computedShareSchema),
		scope: "expense:read",
	}),
	defineOperation({
		name: "expense.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/expenses",
		input: createExpenseSchema,
		output: expenseDetailSchema,
		scope: "expense:create",
		idempotent: true,
		mcp: {
			tool: "createExpense",
			description: "Create and split an expense in its original currency",
		},
	}),
	defineOperation({
		name: "expense.update",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/expenses/:expenseId",
		input: updateExpenseSchema,
		output: expenseDetailSchema,
		scope: "expense:update",
		idempotent: true,
	}),
	defineOperation({
		name: "expense.delete",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/expenses/:expenseId",
		input: expenseIdSchema,
		output: groupSuccessSchema,
		scope: "expense:delete",
		idempotent: true,
	}),
	defineOperation({
		name: "expense.resplit",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/expenses/resplit",
		input: bulkResplitSchema,
		output: bulkResplitResultSchema,
		scope: "expense:update",
		idempotent: true,
	}),
	defineOperation({
		name: "expense.report",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/reports/expenses",
		input: expenseReportSchema,
		output: expenseReportFileSchema,
		responseType: "file",
		scope: "expense:read",
	}),
	defineOperation({
		name: "share.paid",
		kind: "mutation",
		method: "POST",
		path: "/v1/expenses/:expenseId/shares/:userId/paid",
		input: sharePaidSchema,
		output: expenseDetailSchema,
		scope: "expense:update",
		idempotent: true,
	}),
	defineOperation({
		name: "share.unpaid",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/expenses/:expenseId/shares/:userId/paid",
		input: sharePaidSchema.omit({ paid: true }),
		output: expenseDetailSchema,
		scope: "expense:update",
		idempotent: true,
	}),

	defineOperation({
		name: "category.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/categories",
		input: categoryRulesSchema,
		output: z.array(categoryRuleSchema),
		scope: "category:read",
	}),
	defineOperation({
		name: "category.suggest",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/categories/suggest",
		input: suggestCategorySchema,
		output: categorySuggestionSchema,
		scope: "category:read",
	}),
	defineOperation({
		name: "category.backfillPreview",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/categories/backfill",
		input: categoryBackfillSchema,
		output: categoryBackfillResultSchema,
		scope: "expense:read",
	}),
	defineOperation({
		name: "category.apply",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/categories/apply",
		input: applyCategoriesSchema,
		output: z.object({ updated: z.number() }),
		scope: "expense:update",
		idempotent: true,
	}),
	defineOperation({
		name: "category.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/categories",
		input: createCategoryRuleSchema,
		output: categoryRuleSchema.extend({ recategorized: z.number() }),
		scope: "category:create",
		idempotent: true,
	}),
	defineOperation({
		name: "category.import",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/categories/import",
		input: importCategoryRulesSchema,
		output: z.object({ imported: z.number(), skipped: z.number() }),
		scope: "category:create",
		idempotent: true,
	}),
	defineOperation({
		name: "category.update",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/groups/:groupId/categories/:ruleId",
		input: updateCategoryRuleSchema,
		output: categoryRuleSchema,
		scope: "category:update",
		idempotent: true,
	}),
	defineOperation({
		name: "category.delete",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/groups/:groupId/categories/:ruleId",
		input: deleteCategoryRuleSchema,
		output: successSchema,
		scope: "category:delete",
		idempotent: true,
	}),

	defineOperation({
		name: "balance.get",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/balances",
		input: groupIdSchema,
		output: groupBalancesSchema,
		scope: "balance:read",
		mcp: {
			tool: "getBalances",
			description: "Get balances and simplified transfers per currency",
		},
	}),
	defineOperation({
		name: "balance.crossGroup",
		kind: "read",
		method: "GET",
		path: "/v1/me/balances",
		input: crossGroupBalancesSchema,
		output: z.array(crossGroupBalanceSchema),
		scope: "balance:read",
	}),
	defineOperation({
		name: "payment.intents",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/payment-intents",
		input: paymentIntentsSchema,
		output: paymentIntentsResultSchema,
		scope: "balance:read",
	}),
	defineOperation({
		name: "settlement.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/settlements",
		input: groupIdSchema,
		output: z.array(settlementDetailSchema),
		scope: "settlement:read",
	}),
	defineOperation({
		name: "settlement.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/settlements",
		input: createSettlementSchema,
		output: settlementRecordSchema.optional(),
		scope: "settlement:create",
		idempotent: true,
	}),
	defineOperation({
		name: "settlement.delete",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/settlements/:settlementId",
		input: settlementIdSchema,
		output: groupSuccessSchema,
		scope: "settlement:delete",
		idempotent: true,
	}),

	defineOperation({
		name: "activity.group",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/activity",
		input: activitySchema,
		output: groupActivityPageSchema,
		scope: "activity:read",
	}),
	defineOperation({
		name: "activity.mine",
		kind: "read",
		method: "GET",
		path: "/v1/me/activity",
		input: myPageSchema,
		output: myActivityPageSchema,
		scope: "activity:read",
	}),
	defineOperation({
		name: "reminder.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/reminders",
		input: listRemindersSchema,
		output: z.array(reminderJobSchema),
		scope: "reminder:read",
	}),
	defineOperation({
		name: "reminder.schedule",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/reminders",
		input: scheduleReminderSchema,
		output: reminderJobSchema,
		scope: "reminder:create",
		idempotent: true,
	}),
	defineOperation({
		name: "reminder.preferences.get",
		kind: "read",
		method: "GET",
		path: "/v1/me/reminder-preferences",
		input: getReminderPreferencesSchema,
		output: reminderPreferencesResultSchema,
		scope: "reminder:read",
	}),
	defineOperation({
		name: "reminder.preferences.update",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/me/reminder-preferences",
		input: reminderPreferencesSchema,
		output: reminderPreferencesResultSchema,
		scope: "reminder:update",
		idempotent: true,
	}),
	defineOperation({
		name: "recurring.list",
		kind: "read",
		method: "GET",
		path: "/v1/groups/:groupId/recurring-expenses",
		input: listRecurringExpensesSchema,
		output: z.array(recurringExpenseRecordSchema),
		scope: "expense:read",
	}),
	defineOperation({
		name: "recurring.create",
		kind: "mutation",
		method: "POST",
		path: "/v1/groups/:groupId/recurring-expenses",
		input: createRecurringExpenseSchema,
		output: recurringExpenseRecordSchema,
		scope: "expense:create",
		idempotent: true,
	}),
	defineOperation({
		name: "recurring.update",
		kind: "mutation",
		method: "PATCH",
		path: "/v1/recurring-expenses/:templateId",
		input: updateRecurringExpenseSchema,
		output: recurringExpenseRecordSchema,
		scope: "expense:update",
		idempotent: true,
	}),
	defineOperation({
		name: "recurring.delete",
		kind: "mutation",
		method: "DELETE",
		path: "/v1/recurring-expenses/:templateId",
		input: deleteRecurringExpenseSchema,
		output: groupSuccessSchema,
		scope: "expense:delete",
		idempotent: true,
	}),

	defineOperation({
		name: "preset.shortcut.groups",
		kind: "read",
		method: "GET",
		path: "/v1/presets/shortcut/groups",
		input: empty,
		output: shortcutMenuSchema,
		scope: "group:read",
		preset: { legacyPath: "/shortcut/groups" },
	}),
	defineOperation({
		name: "preset.shortcut.members",
		kind: "read",
		method: "GET",
		path: "/v1/presets/shortcut/groups/:groupId/members",
		input: groupIdSchema,
		output: shortcutMenuSchema,
		scope: "member:read",
		preset: { legacyPath: "/shortcut/groups/:groupId/members" },
	}),
	defineOperation({
		name: "preset.shortcut.expense",
		kind: "mutation",
		method: "POST",
		path: "/v1/presets/shortcut/groups/:groupId/expenses",
		input: shortcutCreateSchema,
		output: quickExpenseResultSchema,
		scope: "expense:create",
		idempotent: true,
		preset: { legacyPath: "/shortcut/groups/:groupId/expenses" },
	}),
] as const;

type AppEndpointContract = {
	name: string;
	method: HttpMethod;
	path: `/v1/${string}`;
	input: z.ZodType;
	output: z.ZodType;
	/**
	 * `public` needs no credentials. `session` needs the browser session
	 * cookie, or an API key whose owner opted it into full account access.
	 */
	access: "public" | "session";
	/** Send the input as query parameters even though the method has a body. */
	inputIn?: "query";
};

const defineAppEndpoint = <const Endpoint extends AppEndpointContract>(
	endpoint: Endpoint,
) => endpoint;

/**
 * The app's own endpoints: one request per screen, plus the account. They are
 * not part of the scoped REST API, so API keys can't call most of them.
 */
export const appEndpoints = [
	defineAppEndpoint({
		name: "health",
		method: "GET",
		path: "/v1/health",
		input: empty,
		output: healthSchema,
		access: "public",
	}),
	defineAppEndpoint({
		name: "site.get",
		method: "GET",
		path: "/v1/site",
		input: empty,
		output: siteInfoSchema,
		access: "public",
	}),
	defineAppEndpoint({
		name: "legal.get",
		method: "GET",
		path: "/v1/legal",
		input: empty,
		output: legalInfoSchema,
		access: "public",
	}),
	defineAppEndpoint({
		name: "session.get",
		method: "GET",
		path: "/v1/session",
		input: empty,
		output: sessionSchema,
		access: "public",
	}),
	defineAppEndpoint({
		name: "verification.pending",
		method: "GET",
		path: "/v1/pending-verification",
		input: empty,
		output: pendingVerificationSchema,
		access: "public",
	}),
	defineAppEndpoint({
		name: "verification.send",
		method: "POST",
		path: "/v1/pending-verification/send",
		/** Where the verification link lands after confirming. */
		input: z.object({ next: z.string().optional() }),
		output: verificationSendSchema,
		access: "public",
		inputIn: "query",
	}),
	defineAppEndpoint({
		name: "app.dashboard",
		method: "GET",
		path: "/v1/app/dashboard",
		input: empty,
		output: dashboardSchema,
		access: "session",
	}),
	defineAppEndpoint({
		name: "app.composer",
		method: "GET",
		path: "/v1/app/composer",
		input: empty,
		output: composerSchema,
		access: "session",
	}),
	defineAppEndpoint({
		name: "app.groupDirectory",
		method: "GET",
		path: "/v1/app/group-directory",
		input: empty,
		output: groupDirectorySchema,
		access: "session",
	}),
	defineAppEndpoint({
		name: "app.groupContext",
		method: "GET",
		path: "/v1/app/groups/:groupId/context",
		input: groupIdSchema,
		output: groupContextSchema,
		access: "session",
	}),
	defineAppEndpoint({
		name: "app.groupSummary",
		method: "GET",
		path: "/v1/app/groups/:groupId/financial-summary",
		input: groupIdSchema,
		output: groupFinancialSummarySchema,
		access: "session",
	}),
	defineAppEndpoint({
		name: "app.groupSettings",
		method: "GET",
		path: "/v1/app/groups/:groupId/settings",
		input: groupIdSchema,
		output: groupSettingsSchema,
		access: "session",
	}),
	defineAppEndpoint({
		name: "app.groupPage",
		method: "GET",
		path: "/v1/app/groups/:groupId/page",
		input: groupIdSchema,
		output: groupPageSchema,
		access: "session",
	}),
	defineAppEndpoint({
		name: "profile.update",
		method: "PATCH",
		path: "/v1/me/profile",
		input: updateProfileSchema,
		output: profileSchema,
		access: "session",
	}),
	defineAppEndpoint({
		name: "apiKey.list",
		method: "GET",
		path: "/v1/me/api-keys",
		input: empty,
		output: z.array(apiKeySummarySchema),
		access: "session",
	}),
	defineAppEndpoint({
		name: "apiKey.create",
		method: "POST",
		path: "/v1/me/api-keys",
		input: createApiKeySchema,
		output: createdApiKeySchema,
		access: "session",
	}),
	defineAppEndpoint({
		name: "apiKey.delete",
		method: "DELETE",
		path: "/v1/me/api-keys/:keyId",
		input: z.object({ keyId: z.string().min(1) }),
		output: z.object({ success: z.literal(true) }),
		access: "session",
	}),
] as const;

export type OperationContractEntry = (typeof operationContracts)[number];
export type OperationName = OperationContractEntry["name"];
export type AppEndpoint = (typeof appEndpoints)[number];
export type AppEndpointName = AppEndpoint["name"];

/** Everything a client can call, REST operations and app endpoints alike. */
export const endpoints = [...operationContracts, ...appEndpoints] as const;
export type Endpoint = (typeof endpoints)[number];
export type EndpointName = Endpoint["name"];
export type EndpointFor<Name extends EndpointName> = Extract<
	Endpoint,
	{ name: Name }
>;
/** What a caller passes: before defaults and coercion. */
export type EndpointInput<Name extends EndpointName> = z.input<
	EndpointFor<Name>["input"]
>;
/** What comes back over the wire. */
export type EndpointOutput<Name extends EndpointName> = z.output<
	EndpointFor<Name>["output"]
>;

export type MutationContract = Extract<
	OperationContractEntry,
	{ kind: "mutation" }
>;
export type MutationName = MutationContract["name"];
/** A mutation as the app's generic mutate path sends it. */
export type MutationInput = MutationContract extends infer Item
	? Item extends {
			name: infer Name extends string;
			input: infer Schema extends z.ZodType;
		}
		? { action: Name; input: z.infer<Schema> }
		: never
	: never;
