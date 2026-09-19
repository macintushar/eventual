import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { routeContext } from "#/server/fn/route-context";
import {
	executeOperation,
	mutationSchema,
	operationByName,
} from "#/server/operations";
import { listExpensesSchema } from "#/server/schemas/expenses";
import * as services from "#/server/services/app";

const groupInput = z.object({ groupId: z.string() });
const expenseInput = z.object({ expenseId: z.string() });

export const getDashboardFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const ctx = await routeContext();
		const [groups, invitations, crossGroupBalances] = await Promise.all([
			services.listGroups(ctx),
			services.listMyInvitations(ctx),
			services.getCrossGroupBalances(ctx),
		]);
		return {
			groups,
			invitations,
			crossGroupBalances,
			user: ctx.user,
		};
	},
);

/**
 * Everything the expense composer needs to open cold. It is reachable from the
 * dock on any signed-in page, so it cannot assume a group route loader ran.
 */
export const getComposerFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const ctx = await routeContext();
		return {
			groups: await services.listGroupsWithMembers(ctx),
			user: ctx.user,
		};
	},
);

export const getGroupPageFn = createServerFn({ method: "GET" })
	.validator(groupInput)
	.handler(async ({ data }) => {
		const ctx = await routeContext();
		const group = await services.getGroup(ctx, data);
		const [
			expenses,
			balances,
			settlements,
			activities,
			paymentIntents,
			recurringExpenses,
			reminders,
			categoryRules,
		] = await Promise.all([
			services.listExpenses(ctx, data),
			services.getBalances(ctx, data),
			services.listSettlements(ctx, data),
			services.listActivity(ctx, data),
			services.getPaymentIntents(ctx, data),
			services.listRecurringExpenses(ctx, data),
			services.listReminders(ctx, data),
			services.listCategoryRules(ctx, data),
		]);
		const invitations =
			group.myRole === "member"
				? []
				: await services.listInvitations(ctx, data);
		return {
			group,
			expenses,
			balances,
			settlements,
			activities,
			paymentIntents,
			recurringExpenses,
			reminders,
			categoryRules,
			invitations,
			user: ctx.user,
		};
	});

export const getActivityFn = createServerFn({ method: "GET" })
	.validator(z.object({ groupId: z.string(), cursor: z.string().optional() }))
	.handler(async ({ data }) =>
		services.listActivity(await routeContext(), data),
	);

/** The signed-in person's own feed, across every group they have been in. */
export const getMyActivityFn = createServerFn({ method: "GET" })
	.validator(z.object({ cursor: z.string().optional() }).optional())
	.handler(async ({ data }) =>
		services.listMyActivity(await routeContext(), data ?? {}),
	);

export const getExpenseFn = createServerFn({ method: "GET" })
	.validator(expenseInput)
	.handler(async ({ data }) => services.getExpense(await routeContext(), data));

export const searchExpensesFn = createServerFn({ method: "GET" })
	.validator(listExpensesSchema)
	.handler(async ({ data }) =>
		services.listExpenses(await routeContext(), data),
	);

export const getInvitationFn = createServerFn({ method: "GET" })
	.validator(z.object({ invitationId: z.string() }))
	.handler(async ({ data }) => services.getInvitation(null, data));

export const mutateFn = createServerFn({ method: "POST" })
	.validator(mutationSchema)
	.handler(async ({ data }) => {
		const ctx = await routeContext();
		const operation = operationByName.get(data.action);
		if (!operation || operation.kind !== "mutation")
			throw new Error(`Unknown mutation: ${data.action}`);
		return executeOperation(operation, ctx, data.input, "web");
	});
