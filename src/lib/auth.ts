import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "#/db";
import * as schema from "#/db/schema";
import { env } from "#/env";
import { authEmailOptions, emailKey } from "#/lib/auth-email";
import { guestAuthGuards, guestAuthPlugin } from "#/lib/guest-auth";
import { sendEmail } from "#/server/email";
import { reportError } from "#/server/error-reporting";

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

export const auth = betterAuth({
	appName: "Eventual",
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	trustedOrigins: import.meta.env.DEV
		? ["http://localhost:*", "http://127.0.0.1:*"]
		: [env.BETTER_AUTH_URL],
	database: drizzleAdapter(db, { provider: "sqlite", schema }),
	...guestAuthGuards(db),
	user: {
		// Written only through `updateProfileFn`, which validates them; `input:
		// false` keeps better-auth's own update-user endpoint from bypassing that.
		additionalFields: {
			upiVpa: { type: "string", required: false, input: false },
			wiseTag: { type: "string", required: false, input: false },
			isGuest: { type: "boolean", required: false, input: false },
			claimedAt: { type: "date", required: false, input: false },
			emailReminders: { type: "boolean", required: false, input: false },
		},
	},
	...authEmailOptions(
		sendEmail,
		env.BETTER_AUTH_URL,
		Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
	),
	socialProviders:
		env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
			? {
					google: {
						clientId: env.GOOGLE_CLIENT_ID,
						clientSecret: env.GOOGLE_CLIENT_SECRET,
					},
				}
			: undefined,
	account: {
		accountLinking: {
			enabled: true,
			allowDifferentEmails: true,
		},
	},
	rateLimit: {
		customRules: {
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
		tanstackStartCookies(),
	],
});
