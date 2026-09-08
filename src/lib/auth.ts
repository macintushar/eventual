import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "#/db";
import * as schema from "#/db/schema";
import { env } from "#/env";

export const auth = betterAuth({
	appName: "EvenTual",
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	// Vite falls back to 3001+ when 3000 is taken; trust any local origin in dev.
	trustedOrigins: import.meta.env.DEV
		? ["http://localhost:*", "http://127.0.0.1:*"]
		: [],
	database: drizzleAdapter(db, { provider: "sqlite", schema }),
	emailAndPassword: { enabled: true, requireEmailVerification: false },
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
			defaultPrefix: "ss_",
			rateLimit: {
				enabled: true,
				timeWindow: 1000 * 60 * 60,
				maxRequests: 1000,
			},
		}),
		tanstackStartCookies(),
	],
});
