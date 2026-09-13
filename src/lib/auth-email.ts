import { createHash } from "node:crypto";
import type { BetterAuthOptions } from "better-auth";
import type { TransactionalEmailProps } from "#/emails/transactional";

export type SendAuthEmail = (
	to: string,
	props: TransactionalEmailProps,
	idempotencyKey: string,
) => Promise<string>;

// Tokens must never appear in provider metadata or application logs.
export function emailKey(kind: string, value: string) {
	return `${kind}/${createHash("sha256").update(value).digest("hex")}`;
}

export function authEmailOptions(
	send: SendAuthEmail,
	origin: string,
	configured: boolean,
) {
	return {
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
			revokeSessionsOnPasswordReset: true,
			resetPasswordTokenExpiresIn: 3600,
			sendResetPassword: async ({ user, url, token }) => {
				// Keep the public response identical for existing and unknown users,
				// including when delivery fails. Operators get a token-free failure log.
				await send(
					user.email,
					{ kind: "reset-password", name: user.name, url },
					emailKey("reset", token),
				).catch(() => console.error("Password-reset email could not be sent"));
			},
			onPasswordReset: async ({ user }) => {
				// The password has already changed: a notification error must not
				// interrupt token consumption or session revocation.
				await send(
					user.email,
					{
						kind: "password-changed",
						name: user.name,
						url: new URL("/forgot-password", origin).toString(),
					},
					emailKey("password-changed", crypto.randomUUID()),
				).catch(() =>
					console.error("Password-change notification could not be sent"),
				);
			},
		},
		emailVerification: {
			sendOnSignUp: configured,
			expiresIn: 3600,
			sendVerificationEmail: async ({ user, url, token }) => {
				try {
					await send(
						user.email,
						{ kind: "verification", name: user.name, url },
						emailKey("verification", token),
					);
				} catch {
					console.error("Verification email could not be sent");
					// Better Auth treats this hook as a background notification. Signup
					// still succeeds and settings lets the user request a fresh link.
				}
			},
		},
	} satisfies Pick<BetterAuthOptions, "emailAndPassword" | "emailVerification">;
}
