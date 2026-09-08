import { ZodError } from "zod";

import { buildContext } from "#/server/context";
import { AppError, errorStatus } from "#/server/errors";
import {
	createExpenseSchema,
	createGroupSchema,
	createSettlementSchema,
	inviteSchema,
	previewExpenseSchema,
	roleSchema,
	updateExpenseSchema,
} from "#/server/schemas";
import * as services from "#/server/services/app";

export async function handle(action: () => Promise<unknown>) {
	try {
		return Response.json(await action());
	} catch (error) {
		if (error instanceof ZodError)
			return Response.json(
				{
					error: {
						code: "VALIDATION",
						message: "Invalid request",
						details: error.flatten(),
					},
				},
				{ status: 422 },
			);
		if (error instanceof AppError)
			return Response.json(
				{
					error: {
						code: error.code,
						message: error.message,
						details: error.details,
					},
				},
				{ status: errorStatus[error.code] },
			);
		console.error(error);
		return Response.json(
			{ error: { code: "INTERNAL", message: "An unexpected error occurred" } },
			{ status: 500 },
		);
	}
}

const jsonBody = async (request: Request) => request.json() as Promise<unknown>;

export async function dispatchApi(request: Request, splat: string) {
	const method = request.method;
	const path = splat.replace(/^\/+|\/+$/g, "");
	const parts = path.split("/");
	const url = new URL(request.url);

	return handle(async () => {
		if (method === "GET" && path === "groups")
			return services.listGroups(await buildContext(request));
		if (method === "POST" && path === "groups")
			return services.createGroup(
				await buildContext(request),
				createGroupSchema.parse(await jsonBody(request)),
			);
		if (method === "GET" && path === "me/invitations")
			return services.listMyInvitations(await buildContext(request));

		if (parts[0] === "invitations" && parts[1]) {
			const invitationId = parts[1];
			if (method === "GET" && parts.length === 2)
				return services.getInvitation(null, { invitationId });
			if (method === "DELETE" && parts.length === 2)
				return services.revokeInvitation(await buildContext(request), {
					invitationId,
				});
			if (method === "POST" && parts[2] === "accept")
				return services.acceptInvitation(await buildContext(request), {
					invitationId,
				});
		}

		if (parts[0] === "expenses" && parts[1]) {
			const expenseId = parts[1];
			if (method === "GET" && parts.length === 2)
				return services.getExpense(await buildContext(request), { expenseId });
			if (method === "PATCH" && parts.length === 2)
				return services.updateExpense(
					await buildContext(request),
					updateExpenseSchema.parse({
						...((await jsonBody(request)) as object),
						expenseId,
					}),
				);
			if (method === "DELETE" && parts.length === 2)
				return services.deleteExpense(await buildContext(request), {
					expenseId,
				});
			if (parts[2] === "shares" && parts[3] && parts[4] === "paid")
				return services.setSharePaid(
					await buildContext(request),
					{ expenseId, userId: parts[3] },
					method === "POST",
				);
		}

		if (parts[0] === "settlements" && parts[1] && method === "DELETE")
			return services.deleteSettlement(await buildContext(request), {
				settlementId: parts[1],
			});

		if (parts[0] === "groups" && parts[1]) {
			const groupId = parts[1];
			const ctx = await buildContext(request);
			if (parts.length === 2) {
				if (method === "GET") return services.getGroup(ctx, { groupId });
				if (method === "PATCH")
					return services.renameGroup(ctx, {
						groupId,
						name: createGroupSchema.shape.name.parse(
							((await jsonBody(request)) as { name?: unknown }).name,
						),
					});
				if (method === "DELETE") return services.deleteGroup(ctx, { groupId });
			}
			if (parts[2] === "leave" && method === "POST")
				return services.leaveGroup(ctx, { groupId });
			if (parts[2] === "members") {
				if (parts.length === 3 && method === "GET")
					return services.listMembers(ctx, { groupId });
				if (parts[3] && method === "PATCH")
					return services.updateMemberRole(ctx, {
						groupId,
						userId: parts[3],
						role: roleSchema.parse(
							((await jsonBody(request)) as { role?: unknown }).role,
						),
					});
				if (parts[3] && method === "DELETE")
					return services.removeMember(ctx, { groupId, userId: parts[3] });
			}
			if (parts[2] === "invitations") {
				if (method === "GET") return services.listInvitations(ctx, { groupId });
				if (method === "POST")
					return services.createInvitation(
						ctx,
						inviteSchema.parse({
							...((await jsonBody(request)) as object),
							groupId,
						}),
					);
			}
			if (parts[2] === "expenses") {
				if (parts[3] === "preview" && method === "POST")
					return services.previewExpense(
						previewExpenseSchema.parse(await jsonBody(request)),
					);
				if (method === "POST")
					return services.createExpense(
						ctx,
						createExpenseSchema.parse({
							...((await jsonBody(request)) as object),
							groupId,
						}),
					);
				if (method === "GET")
					return services.listExpenses(ctx, {
						groupId,
						cursor: url.searchParams.get("cursor") ?? undefined,
						limit: Number(url.searchParams.get("limit") ?? 30),
						paidBy: url.searchParams.get("paidBy") ?? undefined,
						participant: url.searchParams.get("participant") ?? undefined,
						from: url.searchParams.get("from")
							? new Date(url.searchParams.get("from") ?? "")
							: undefined,
						to: url.searchParams.get("to")
							? new Date(url.searchParams.get("to") ?? "")
							: undefined,
					});
			}
			if (parts[2] === "balances" && method === "GET")
				return services.getBalances(ctx, { groupId });
			if (parts[2] === "settlements") {
				if (method === "GET") return services.listSettlements(ctx, { groupId });
				if (method === "POST")
					return services.createSettlement(
						ctx,
						createSettlementSchema.parse({
							...((await jsonBody(request)) as object),
							groupId,
						}),
					);
			}
			if (parts[2] === "activity" && method === "GET")
				return services.listActivity(ctx, {
					groupId,
					cursor: url.searchParams.get("cursor") ?? undefined,
					limit: Number(url.searchParams.get("limit") ?? 30),
				});
		}

		throw new AppError("NOT_FOUND", "API endpoint not found");
	});
}
