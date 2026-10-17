import {
	type MutationInput,
	type OperationContractEntry,
	type OperationName,
	operationContracts,
} from "@eventual/schemas/contract";
import { z } from "zod";
import { getAppLogger } from "#/lib/logging";
import type { Ctx } from "#/server/context";
import { measuredOperation } from "#/server/measured-operation";
import * as services from "#/server/services/app";
import * as shortcut from "#/server/services/shortcut";

export type { MutationInput, OperationName };
export type OperationSurface = "web" | "rest" | "mcp" | "shortcut";
export type OperationMethod = OperationContractEntry["method"];

type ContractFor<Name extends OperationName> = Extract<
	OperationContractEntry,
	{ name: Name }
>;
type Handler<Name extends OperationName> = (
	ctx: Ctx,
	input: z.output<ContractFor<Name>["input"]>,
) => unknown;

/**
 * What each operation in `@eventual/schemas/contract` runs. The contract owns
 * the route, input and output; `contract.check.ts` holds every handler's
 * result to its declared output.
 */
export const handlers = {
	"expense.page": services.listExpensePage,
	"settlement.page": services.listSettlementPage,
	"group.list": (ctx) => services.listGroups(ctx),
	"group.create": services.createGroup,
	"group.get": services.getGroup,
	"group.rename": services.renameGroup,
	"group.delete": services.deleteGroup,
	"group.leave": services.leaveGroup,
	"group.archive": services.archiveGroup,
	"group.unarchive": services.unarchiveGroup,
	"group.duplicate": services.duplicateGroup,
	"member.list": services.listMembers,
	"member.add": services.addMember,
	"member.role": services.updateMemberRole,
	"member.remove": services.removeMember,
	"member.weight": services.updateMemberWeight,
	"member.updateGuest": services.updateGuest,
	"member.merge": services.mergeGuest,
	"invitation.mine": (ctx) => services.listMyInvitations(ctx),
	"invitation.list": services.listInvitations,
	"invitation.create": services.createInvitation,
	"invitation.get": (_ctx, input) => services.getInvitation(null, input),
	"invitation.revoke": services.revokeInvitation,
	"invitation.accept": services.acceptInvitation,
	"expense.list": services.listExpenses,
	"expense.get": services.getExpense,
	"expense.preview": services.previewGroupExpense,
	"expense.create": services.createExpense,
	"expense.update": services.updateExpense,
	"expense.delete": services.deleteExpense,
	"expense.resplit": services.bulkResplitExpenses,
	"expense.report": services.expenseReport,
	"share.paid": (ctx, input) => services.setSharePaid(ctx, input, input.paid),
	"share.unpaid": (ctx, input) => services.setSharePaid(ctx, input, false),
	"category.list": services.listCategoryRules,
	"category.suggest": services.suggestCategory,
	"category.backfillPreview": services.previewCategoryBackfill,
	"category.apply": services.applyCategories,
	"category.create": services.createCategoryRule,
	"category.import": services.importCategoryRules,
	"category.update": services.updateCategoryRule,
	"category.delete": services.deleteCategoryRule,
	"balance.get": services.getBalances,
	"balance.crossGroup": (ctx) => services.getCrossGroupBalances(ctx),
	"payment.intents": services.getPaymentIntents,
	"settlement.list": services.listSettlements,
	"settlement.create": services.createSettlement,
	"settlement.delete": services.deleteSettlement,
	"activity.group": services.listActivity,
	"activity.mine": services.listMyActivity,
	"reminder.list": services.listReminders,
	"reminder.schedule": services.scheduleReminder,
	"reminder.preferences.get": (ctx) => services.getReminderPreferences(ctx),
	"reminder.preferences.update": services.updateReminderPreferences,
	"recurring.list": services.listRecurringExpenses,
	"recurring.create": services.createRecurringExpense,
	"recurring.update": services.updateRecurringExpense,
	"recurring.delete": services.deleteRecurringExpense,
	"preset.shortcut.groups": (ctx) => shortcut.shortcutGroups(ctx),
	"preset.shortcut.members": shortcut.shortcutMembers,
	"preset.shortcut.expense": shortcut.quickExpense,
} satisfies { [Name in OperationName]: Handler<Name> };

export type Operation = {
	[Name in OperationName]: ContractFor<Name> & {
		handler: (typeof handlers)[Name];
	};
}[OperationName];
export type MutationOperation = Extract<Operation, { kind: "mutation" }>;

export const operations = operationContracts.map((contract) => ({
	...contract,
	handler: handlers[contract.name],
})) as unknown as readonly Operation[];

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
	const logger = getAppLogger("operations").with({
		operation: operation.name,
		kind: operation.kind,
	});
	const startedAt = performance.now();
	logger.debug("Operation started");
	try {
		const parsed = operation.input.parse(input);
		const result = await operation.handler(ctx as never, parsed as never);
		logger.info("Operation completed", {
			durationMs: Math.round(performance.now() - startedAt),
		});
		return result;
	} catch (error) {
		// The transport reports unexpected exceptions once; keep operation context here.
		logger.warning("Operation failed", {
			errorType: error instanceof Error ? error.name : "Unknown",
			durationMs: Math.round(performance.now() - startedAt),
		});
		throw error;
	}
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
