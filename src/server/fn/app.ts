import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { routeContext } from "#/server/fn/route-context";
import {
	createExpenseSchema,
	createGroupSchema,
	createSettlementSchema,
	updateExpenseSchema,
} from "#/server/schemas";
import * as services from "#/server/services/app";

const groupInput = z.object({ groupId: z.string() });
const expenseInput = z.object({ expenseId: z.string() });

export const getDashboardFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const ctx = await routeContext();
		return {
			groups: await services.listGroups(ctx),
			invitations: await services.listMyInvitations(ctx),
			user: ctx.user,
		};
	},
);

export const getGroupPageFn = createServerFn({ method: "GET" })
	.validator(groupInput)
	.handler(async ({ data }) => {
		const ctx = await routeContext();
		const group = await services.getGroup(ctx, data);
		const [expenses, balances, settlements, activities] = await Promise.all([
			services.listExpenses(ctx, data),
			services.getBalances(ctx, data),
			services.listSettlements(ctx, data),
			services.listActivity(ctx, data),
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
			invitations,
			user: ctx.user,
		};
	});

export const getActivityFn = createServerFn({ method: "GET" })
	.validator(z.object({ groupId: z.string(), cursor: z.string().optional() }))
	.handler(async ({ data }) =>
		services.listActivity(await routeContext(), data),
	);

export const getExpenseFn = createServerFn({ method: "GET" })
	.validator(expenseInput)
	.handler(async ({ data }) => services.getExpense(await routeContext(), data));

export const getInvitationFn = createServerFn({ method: "GET" })
	.validator(z.object({ invitationId: z.string() }))
	.handler(async ({ data }) => services.getInvitation(null, data));

const mutationSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("group.create"), input: createGroupSchema }),
	z.object({
		action: z.literal("group.rename"),
		input: z.object({
			groupId: z.string(),
			name: z.string().trim().min(1).max(100),
		}),
	}),
	z.object({ action: z.literal("group.delete"), input: groupInput }),
	z.object({ action: z.literal("group.leave"), input: groupInput }),
	z.object({
		action: z.literal("member.role"),
		input: z.object({
			groupId: z.string(),
			userId: z.string(),
			role: z.enum(["owner", "admin", "member"]),
		}),
	}),
	z.object({
		action: z.literal("member.remove"),
		input: z.object({ groupId: z.string(), userId: z.string() }),
	}),
	z.object({
		action: z.literal("invitation.create"),
		input: z.object({
			groupId: z.string(),
			email: z.string().email(),
			role: z.enum(["owner", "admin", "member"]),
		}),
	}),
	z.object({
		action: z.literal("invitation.revoke"),
		input: z.object({ invitationId: z.string() }),
	}),
	z.object({
		action: z.literal("invitation.accept"),
		input: z.object({ invitationId: z.string() }),
	}),
	z.object({ action: z.literal("expense.create"), input: createExpenseSchema }),
	z.object({ action: z.literal("expense.update"), input: updateExpenseSchema }),
	z.object({ action: z.literal("expense.delete"), input: expenseInput }),
	z.object({
		action: z.literal("share.paid"),
		input: z.object({
			expenseId: z.string(),
			userId: z.string(),
			paid: z.boolean(),
		}),
	}),
	z.object({
		action: z.literal("settlement.create"),
		input: createSettlementSchema,
	}),
	z.object({
		action: z.literal("settlement.delete"),
		input: z.object({ settlementId: z.string() }),
	}),
]);

export const mutateFn = createServerFn({ method: "POST" })
	.validator(mutationSchema)
	.handler(async ({ data }) => {
		const ctx = await routeContext();
		switch (data.action) {
			case "group.create":
				return services.createGroup(ctx, data.input);
			case "group.rename":
				return services.renameGroup(ctx, data.input);
			case "group.delete":
				return services.deleteGroup(ctx, data.input);
			case "group.leave":
				return services.leaveGroup(ctx, data.input);
			case "member.role":
				return services.updateMemberRole(ctx, data.input);
			case "member.remove":
				return services.removeMember(ctx, data.input);
			case "invitation.create":
				return services.createInvitation(ctx, data.input);
			case "invitation.revoke":
				return services.revokeInvitation(ctx, data.input);
			case "invitation.accept":
				return services.acceptInvitation(ctx, data.input);
			case "expense.create":
				return services.createExpense(ctx, data.input);
			case "expense.update":
				return services.updateExpense(ctx, data.input);
			case "expense.delete":
				return services.deleteExpense(ctx, data.input);
			case "share.paid":
				return services.setSharePaid(ctx, data.input, data.input.paid);
			case "settlement.create":
				return services.createSettlement(ctx, data.input);
			case "settlement.delete":
				return services.deleteSettlement(ctx, data.input);
		}
	});
