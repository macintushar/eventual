import { eq } from "drizzle-orm";
import { z } from "zod";

import { user } from "#/db/schema";
import { env } from "#/env";
import { auth } from "#/lib/auth";
import type { Ctx } from "#/server/context";
import { AppError } from "#/server/errors";
import { getLegalInfo } from "#/server/legal";
import {
	pendingVerificationUser,
	verificationSendStatus,
} from "#/server/pending-verification";
import { updateProfileSchema } from "#/server/schemas";
import * as services from "#/server/services/app";

export type ApiKeySummary = {
	id: string;
	name: string | null;
	start: string | null;
	enabled: boolean;
	expiresAt: string | null;
	lastRequest: string | null;
	createdAt: string;
};

const apiKeyInput = z.object({
	name: z.string().trim().min(1).max(64),
	expiresIn: z.number().int().positive().nullable(),
});

function toIso(value: Date | string | null | undefined) {
	return value ? new Date(value).toISOString() : null;
}

function summarize(key: {
	id: string;
	name: string | null;
	start: string | null;
	enabled: boolean;
	expiresAt: Date | string | null;
	lastRequest: Date | string | null;
	createdAt: Date | string;
}): ApiKeySummary {
	return {
		id: key.id,
		name: key.name,
		start: key.start,
		enabled: key.enabled,
		expiresAt: toIso(key.expiresAt),
		lastRequest: toIso(key.lastRequest),
		createdAt: toIso(key.createdAt) ?? new Date().toISOString(),
	};
}

async function cookieHeaders(request: Request) {
	if (request.headers.get("x-api-key") || request.headers.get("authorization"))
		throw new AppError(
			"FORBIDDEN",
			"API keys cannot be managed with an API key",
		);
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
	return request.headers;
}

export async function dashboard(ctx: Ctx) {
	const [groups, invitations, crossGroupBalances] = await Promise.all([
		services.listGroups(ctx),
		services.listMyInvitations(ctx),
		services.getCrossGroupBalances(ctx),
	]);
	return { groups, invitations, crossGroupBalances, user: ctx.user };
}

export async function composer(ctx: Ctx) {
	return { groups: await services.listGroupsWithMembers(ctx), user: ctx.user };
}

export async function groupPage(ctx: Ctx, groupId: string) {
	const input = { groupId };
	const group = await services.getGroup(ctx, input);
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
		services.listExpenses(ctx, {
			...input,
			offset: 0,
			sortBy: "date",
			sortDirection: "desc",
		}),
		services.getBalances(ctx, input),
		services.listSettlements(ctx, input),
		services.listActivity(ctx, input),
		services.getPaymentIntents(ctx, input),
		services.listRecurringExpenses(ctx, input),
		services.listReminders(ctx, input),
		services.listCategoryRules(ctx, input),
	]);
	const invitations =
		group.myRole === "member" ? [] : await services.listInvitations(ctx, input);
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
}

export async function session(request: Request) {
	const value = await auth.api.getSession({ headers: request.headers });
	return value ? { user: value.user, session: value.session } : null;
}

export async function profile(ctx: Ctx, input: unknown) {
	const data = updateProfileSchema.parse(input);
	const [row] = await ctx.db
		.update(user)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(user.id, ctx.user.id))
		.returning({
			name: user.name,
			upiVpa: user.upiVpa,
			wiseTag: user.wiseTag,
			emailReminders: user.emailReminders,
		});
	return row;
}

export async function listApiKeys(request: Request) {
	const headers = await cookieHeaders(request);
	const result = await auth.api.listApiKeys({
		headers,
		query: { sortBy: "createdAt", sortDirection: "desc" },
	});
	return result.apiKeys.map(summarize);
}

export async function createApiKey(request: Request, input: unknown) {
	const headers = await cookieHeaders(request);
	const data = apiKeyInput.parse(input);
	const created = await auth.api.createApiKey({
		headers,
		body: {
			name: data.name,
			...(data.expiresIn ? { expiresIn: data.expiresIn } : {}),
		},
	});
	return { key: created.key, record: summarize(created) };
}

export async function deleteApiKey(request: Request, keyId: string) {
	const headers = await cookieHeaders(request);
	await auth.api.deleteApiKey({ headers, body: { keyId } });
	return { success: true as const };
}

export async function pendingVerification(request: Request) {
	const found = await pendingVerificationUser(request);
	return found ? { email: found.email } : null;
}

export async function sendPendingVerification(request: Request) {
	const found = await pendingVerificationUser(request);
	if (!found)
		throw new AppError(
			"UNAUTHENTICATED",
			"Verification expired. Sign in again.",
		);
	const recent = await verificationSendStatus(found.id);
	if (recent) return { sent: false, retryAt: recent.expiresAt.toISOString() };
	await auth.api.sendVerificationEmail({
		body: { email: found.email, callbackURL: "/verify-email" },
		headers: request.headers,
	});
	const delivery = await verificationSendStatus(found.id);
	if (!delivery || delivery.value !== "sent")
		throw new AppError(
			"INTERNAL",
			"Could not send the verification email. Try again.",
		);
	return { sent: true, retryAt: delivery.expiresAt.toISOString() };
}

export const legalInfo = getLegalInfo;

export function siteInfo() {
	return {
		origin: new URL(env.BETTER_AUTH_URL).origin,
		supportEmail: env.SUPPORT_EMAIL,
	};
}
