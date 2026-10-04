import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { db } from "#/db";
import { channelIdentity, user } from "#/db/schema";
import { env } from "#/env";
import { auth, presentedApiKey } from "#/lib/auth";
import {
	apiKeyMode,
	FULL_ACCESS_MAX_DAYS,
	keyPresets,
	type Permissions,
	validateKeyPermissions,
} from "#/lib/permissions";
import { withNext } from "#/lib/auth-redirect";
import type { Ctx } from "#/server/context";
import { AppError } from "#/server/errors";
import { getLegalInfo } from "#/server/legal";
import {
	pendingVerificationUser,
	settledVerificationSendStatus,
	verificationSendStatus,
} from "#/server/pending-verification";
import { updateProfileSchema } from "#/server/schemas";
import {
	type ApiKeySummary,
	createApiKeySchema,
} from "#/server/schemas/account";
import * as services from "#/server/services/app";
import {
	crossGroupBalancesFromSummaries,
	readGroupSummaries,
} from "#/server/services/balances";
import {
	groupsFromSummaries,
	listGroupDirectory,
} from "#/server/services/groups";
import { paymentIntentsForBalances } from "#/server/services/payments";
import { id } from "#/server/services/shared";

export type { ApiKeySummary };

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
	permissions?: Record<string, string[]> | null;
}): ApiKeySummary {
	return {
		id: key.id,
		name: key.name,
		start: key.start,
		enabled: key.enabled,
		expiresAt: toIso(key.expiresAt),
		lastRequest: toIso(key.lastRequest),
		createdAt: toIso(key.createdAt) ?? new Date().toISOString(),
		mode: apiKeyMode(key.permissions ?? null),
	};
}

async function cookieSession(request: Request) {
	if (request.headers.get("x-api-key") || request.headers.get("authorization"))
		throw new AppError(
			"FORBIDDEN",
			"API keys cannot be managed with an API key",
		);
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
	return session;
}

async function cookieHeaders(request: Request) {
	await cookieSession(request);
	return request.headers;
}

/**
 * Who is asking, without the rest of the user row. Pages only need the id and
 * name, and `image` can be an inline photo that would otherwise ride along on
 * every dashboard, composer and group response.
 */
function viewer(ctx: Ctx) {
	return { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email };
}

export async function dashboard(ctx: Ctx) {
	const [summaries, invitations] = await Promise.all([
		readGroupSummaries(ctx),
		services.listMyInvitations(ctx),
	]);
	const groups = groupsFromSummaries(ctx.user.id, summaries);
	const crossGroupBalances = crossGroupBalancesFromSummaries(
		ctx.user.id,
		summaries,
	);
	return { groups, invitations, crossGroupBalances, user: viewer(ctx) };
}

export async function composer(ctx: Ctx) {
	return {
		groups: await services.listGroupsWithMembers(ctx),
		user: viewer(ctx),
	};
}

export async function groupDirectory(ctx: Ctx) {
	return { groups: await listGroupDirectory(ctx) };
}

export async function groupContext(ctx: Ctx, groupId: string) {
	return {
		group: await services.getGroup(ctx, { groupId }),
		user: viewer(ctx),
	};
}

export async function groupSummary(ctx: Ctx, groupId: string) {
	const balances = await services.getBalances(ctx, { groupId });
	return {
		balances,
		paymentIntents: await paymentIntentsForBalances(ctx, balances.transfers),
	};
}

export async function groupSettings(ctx: Ctx, groupId: string) {
	const [reminders, categoryRules] = await Promise.all([
		services.listReminders(ctx, { groupId }),
		services.listCategoryRules(ctx, { groupId }),
	]);
	return { reminders, categoryRules };
}

export async function groupPage(ctx: Ctx, groupId: string) {
	const input = { groupId };
	const group = await services.getGroup(ctx, input);
	const [
		expenses,
		balances,
		settlements,
		activities,
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
		services.listRecurringExpenses(ctx, input),
		services.listReminders(ctx, input),
		services.listCategoryRules(ctx, input),
	]);
	const paymentIntents = await paymentIntentsForBalances(
		ctx,
		balances.transfers,
	);
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
		user: viewer(ctx),
	};
}

/** A user's number, from `channel_identity` — the row a guest is added with. */
async function readPhone(userId: string): Promise<string | null> {
	const [row] = await db
		.select({ address: channelIdentity.address })
		.from(channelIdentity)
		.where(
			and(
				eq(channelIdentity.userId, userId),
				eq(channelIdentity.channel, "phone"),
			),
		)
		.limit(1);
	// Checked explicitly rather than with `?.`: `noUncheckedIndexedAccess` is off,
	// so destructuring types the row as present even when no number was saved.
	return row ? row.address : null;
}

/** The browser session, for the app. API keys never have one. */
export async function session(request: Request) {
	if (presentedApiKey(request.headers)) return null;
	const value = await auth.api.getSession({ headers: request.headers });
	if (!value) return null;
	// The number is a `channel_identity`, not a user column, so the session's
	// user row cannot carry it. The profile form needs it to show what is saved
	// rather than an empty field that would clear the number on the next save.
	return {
		user: { ...value.user, phone: await readPhone(value.user.id) },
		session: value.session,
	};
}

export async function profile(ctx: Ctx, input: unknown) {
	const { phone, ...fields } = updateProfileSchema.parse(input);
	// Refused before anything is written, so a rejected number leaves the whole
	// profile as it was rather than half-saved.
	if (phone) await assertPhoneFree(ctx, phone);
	return ctx.db.transaction(async (tx) => {
		const [row] = await tx
			.update(user)
			.set({ ...fields, updatedAt: new Date() })
			.where(eq(user.id, ctx.user.id))
			.returning({
				name: user.name,
				image: user.image,
				upiVpa: user.upiVpa,
				wiseTag: user.wiseTag,
				emailReminders: user.emailReminders,
				bio: user.bio,
				isEmailPublic: user.isEmailPublic,
				isPhonePublic: user.isPhonePublic,
			});
		if (!row) throw new AppError("NOT_FOUND", "Account not found");
		return { ...row, phone: await savePhone(tx, ctx.user.id, phone) };
	});
}

/** The address is unique across every channel row, so a number already held
 * by somebody else has to be refused rather than silently reassigned. */
async function assertPhoneFree(ctx: Ctx, phone: string) {
	const held = await ctx.db.query.channelIdentity.findFirst({
		where: and(
			eq(channelIdentity.channel, "phone"),
			eq(channelIdentity.address, phone),
		),
	});
	if (held && held.userId !== ctx.user.id)
		throw new AppError(
			"CONFLICT",
			"That number is already linked to another account",
		);
}

/**
 * A user's number is a `channel_identity`, the same row a guest is added with,
 * so one profile read covers both. Kept to one row per channel: a number is
 * replaced, never accumulated, and `null` removes it.
 */
async function savePhone(
	tx: Pick<Ctx["db"], "delete" | "insert">,
	userId: string,
	phone: string | null | undefined,
) {
	if (phone === undefined) return readPhone(userId);
	await tx
		.delete(channelIdentity)
		.where(
			and(
				eq(channelIdentity.userId, userId),
				eq(channelIdentity.channel, "phone"),
			),
		);
	if (!phone) return null;
	await tx.insert(channelIdentity).values({
		id: id(),
		userId,
		channel: "phone",
		address: phone,
	});
	return phone;
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
	const session = await cookieSession(request);
	const data = createApiKeySchema.parse(input);
	let permissions: Permissions;
	if (data.mode === "custom") {
		if (!data.permissions || !validateKeyPermissions(data.permissions))
			throw new AppError(
				"VALIDATION",
				"Choose at least one valid permission for a custom key",
			);
		permissions = data.permissions;
	} else {
		permissions = keyPresets[data.mode];
	}
	if (
		data.mode === "full" &&
		(!data.expiresIn || data.expiresIn > FULL_ACCESS_MAX_DAYS * 24 * 60 * 60)
	)
		throw new AppError(
			"VALIDATION",
			`Full account access keys must expire within ${FULL_ACCESS_MAX_DAYS} days`,
		);
	// Better Auth only accepts `permissions` from a server-side call, so the
	// owner comes from the verified cookie session rather than request headers.
	const created = await auth.api
		.createApiKey({
			body: {
				userId: session.user.id,
				name: data.name,
				...(data.expiresIn ? { expiresIn: data.expiresIn } : {}),
				permissions,
			},
		})
		.catch((error: unknown) => {
			// Bad input (an expiry outside the allowed range, say) is the
			// caller's to fix, not a server fault.
			if (error instanceof APIError && error.statusCode < 500)
				throw new AppError("VALIDATION", error.message);
			throw error;
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
	const recent = await settledVerificationSendStatus(found.id);
	if (recent?.value === "sent")
		return { sent: false, retryAt: recent.expiresAt.toISOString() };
	await auth.api.sendVerificationEmail({
		body: {
			email: found.email,
			callbackURL: withNext(
				"/verify-email",
				new URL(request.url).searchParams.get("next") ?? undefined,
			),
		},
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
		// Mirrors the provider registration in #/lib/auth.
		googleSignIn: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
		statusPageUrl: env.STATUS_PAGE_URL,
	};
}
