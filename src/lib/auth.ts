import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "#/db";
import * as schema from "#/db/schema";
import { env } from "#/env";
import { authEmailOptions } from "#/lib/auth-email";
import { sendEmail } from "#/server/email";

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
	// Vite falls back to 3001+ when 3000 is taken; trust any local origin in dev.
	trustedOrigins: import.meta.env.DEV
		? ["http://localhost:*", "http://127.0.0.1:*"]
		: [],
	database: drizzleAdapter(db, { provider: "sqlite", schema }),
	...authEmailOptions(
		sendEmail,
		env.BETTER_AUTH_URL,
		Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
	),
	rateLimit: {
		customRules: {
			"/request-password-reset": { window: 60, max: 3 },
			"/send-verification-email": { window: 60, max: 3 },
		},
	},
	plugins: [
		organization({
			invitationExpiresIn: 60 * 60 * 24 * 7,
			sendInvitationEmail: async ({ invitation }) => {
				console.log(`${env.BETTER_AUTH_URL}/invite/${invitation.id}`);
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
