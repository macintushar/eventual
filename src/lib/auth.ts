import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { lastLoginMethod } from "better-auth/plugins";
import { organization } from "better-auth/plugins/organization";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { env } from "#/env";
import { authEmailOptions, emailKey } from "#/lib/auth-email";
import { guestAuthGuards, guestAuthPlugin } from "#/lib/guest-auth";
import { lastLoginConsentFromRequest } from "#/lib/last-login-consent";
import { getAppLogger } from "#/lib/logging";
import { ac, admin, member, owner } from "#/lib/permissions";
import { sendEmail } from "#/server/email";
import { reportError } from "#/server/error-reporting";
import {
	markVerificationSent,
	releaseVerificationSend,
	reserveVerificationSend,
} from "#/server/pending-verification";
import { storedImageSchema } from "#/server/schemas";

const API_KEY_PREFIX = "ev_";
const LEGACY_API_KEY_PREFIX = "ss_";

/**
 * Reads a user API key from `x-api-key`, or from `Authorization: Bearer ev_…`
 * for MCP clients (Hermes, OpenClaw) configured with bearer tokens. The old
 * `ss_` bearer prefix remains accepted so keys created before the rename keep
 * working.
 */
export function presentedApiKey(headers: Headers | undefined) {
	const direct = headers?.get("x-api-key");
	if (direct) return direct;
	const bearer = headers?.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
	return bearer &&
		(bearer.startsWith(API_KEY_PREFIX) ||
			bearer.startsWith(LEGACY_API_KEY_PREFIX))
		? bearer
		: null;
}

/** Google serves 96px by default; ask for the size the avatar is stored at. */
function googlePhoto(picture: unknown) {
	if (typeof picture !== "string" || !picture) return null;
	return picture.replace(/=s\d+(-c)?$/, "=s256-c");
}

/**
 * The `picture` claim from a Google ID token. It came straight from Google's
 * token endpoint on this server, so it is read without re-verifying.
 */
function pictureFromIdToken(idToken: string) {
	try {
		const payload = idToken.split(".")[1] ?? "";
		const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
		return googlePhoto(claims.picture);
	} catch {
		return null;
	}
}

export const auth = betterAuth({
	logger: {
		level: "debug",
		log(level) {
			const logger = getAppLogger("auth", "sdk");
			// SDK messages/arguments may contain credentials or personal information.
			// Expected login failures are diagnostics; transports own exception capture.
			if (level === "error" || level === "warn")
				logger.warning("Authentication SDK diagnostic", { sdkLevel: level });
			else if (level === "info")
				logger.info("Authentication SDK diagnostic", { sdkLevel: level });
			else logger.debug("Authentication SDK diagnostic", { sdkLevel: level });
		},
	},
	appName: "Eventual",
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	trustedOrigins: import.meta.env?.DEV
		? ["http://localhost:*", "http://127.0.0.1:*"]
		: [env.BETTER_AUTH_URL],
	database: drizzleAdapter(db, { provider: "sqlite", schema }),
	...guestAuthGuards(db),
	user: {
		// Written only through the validated v1 profile endpoint; `input:
		// false` keeps better-auth's own update-user endpoint from bypassing that.
		additionalFields: {
			upiVpa: { type: "string", required: false, input: false },
			wiseTag: { type: "string", required: false, input: false },
			// Always public, so nothing about it is written here — a member
			// writes it knowing the profile shows it to their groups.
			bio: { type: "string", required: false, input: false },
			// Both default on in the database, which is why they stay optional
			// here: an omitted column keeps its default rather than failing.
			isEmailPublic: { type: "boolean", required: false, input: false },
			isPhonePublic: { type: "boolean", required: false, input: false },
			isGuest: { type: "boolean", required: false, input: false },
			claimedAt: { type: "date", required: false, input: false },
			emailReminders: { type: "boolean", required: false, input: false },
		},
	},
	...authEmailOptions(
		sendEmail,
		env.BETTER_AUTH_URL,
		Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
		{
			reserve: reserveVerificationSend,
			markSent: markVerificationSent,
			release: releaseVerificationSend,
		},
	),
	socialProviders:
		env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
			? {
					google: {
						clientId: env.GOOGLE_CLIENT_ID,
						clientSecret: env.GOOGLE_CLIENT_SECRET,
						mapProfileToUser: (profile) => ({
							image: googlePhoto(profile.picture) ?? undefined,
						}),
					},
				}
			: undefined,
	account: {
		// Nothing reads provider tokens; encrypt them at rest anyway.
		encryptOAuthTokens: true,
		accountLinking: {
			enabled: true,
			allowDifferentEmails: false,
		},
	},
	databaseHooks: {
		user: {
			update: {
				// better-auth's own update-user endpoint takes `image` as any
				// string. Hold it to what the profile endpoint allows, since the
				// value is sent to everyone who shares a group with you.
				before: async (data) => {
					if (data.image == null) return;
					if (!storedImageSchema.safeParse(data.image).success)
						throw new APIError("BAD_REQUEST", {
							message: "Upload a JPEG, PNG or WebP photo",
						});
				},
			},
		},
		account: {
			create: {
				// Linking Google later doesn't touch the user row, so better-auth
				// never copies the photo across. Fill it in here, but only into
				// an empty slot: an uploaded photo always wins.
				after: async (account) => {
					if (account.providerId !== "google" || !account.idToken) return;
					const image = pictureFromIdToken(account.idToken);
					if (!image) return;
					await db
						.update(schema.user)
						.set({ image, updatedAt: new Date() })
						.where(
							and(
								eq(schema.user.id, account.userId),
								isNull(schema.user.image),
							),
						);
				},
			},
		},
	},
	rateLimit: {
		// Memory counters reset per serverless instance; the database is shared.
		storage: "database",
		customRules: {
			"/sign-in/email": { window: 60, max: 5 },
			"/sign-up/email": { window: 60, max: 3 },
			"/request-password-reset": { window: 60, max: 3 },
			"/send-verification-email": { window: 60, max: 3 },
			"/guest-claim/request": { window: 60, max: 3 },
			"/guest-claim/confirm": { window: 60, max: 5 },
		},
	},
	plugins: [
		guestAuthPlugin(
			db,
			sendEmail,
			env.BETTER_AUTH_URL,
			Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
		),
		organization({
			ac,
			roles: { owner, admin, member },
			invitationExpiresIn: 60 * 60 * 24 * 7,
			sendInvitationEmail: async ({
				email,
				invitation,
				inviter,
				organization,
			}) => {
				if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return;
				await sendEmail(
					email,
					{
						kind: "invitation",
						url: new URL(
							`/invite/${invitation.id}`,
							env.BETTER_AUTH_URL,
						).toString(),
						groupName: organization.name,
						inviterName: inviter.user.name,
						inviteeRole: invitation.role,
						expiresAt: invitation.expiresAt,
					},
					emailKey("invitation", invitation.id),
				).catch((error) =>
					reportError(error, { component: "email", kind: "invitation" }),
				);
			},
		}),
		apiKey({
			references: "user",
			// Lets full account access keys act as their owner on Better Auth's
			// group and profile endpoints. Every key is gated before it gets
			// there — see src/routes/api/auth/$.ts — and our own API verifies
			// keys itself (src/server/context.ts), so this never widens a scope.
			enableSessionForAPIKeys: true,
			requireName: true,
			maximumNameLength: 64,
			defaultPrefix: API_KEY_PREFIX,
			customAPIKeyGetter: (ctx) => presentedApiKey(ctx.headers),
			rateLimit: {
				enabled: true,
				timeWindow: 1000 * 60 * 60,
				maxRequests: 1000,
			},
		}),
		// Before tanstackStartCookies: after-hooks run in plugin order, so the
		// marker cookie has to be on the response before TanStack forwards it.
		lastLoginMethod({
			// The marker is a readable, non-essential cookie, so it is only
			// written where the visitor opted in on the login screen. Refusing
			// only skips the cookie; sign-in carries on unchanged.
			beforeStoreCookie: (ctx) =>
				lastLoginConsentFromRequest(ctx.headers ?? ctx.request?.headers),
		}),
		tanstackStartCookies(),
	],
});
