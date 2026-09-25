import { createHash } from "node:crypto";
import type { BetterAuthOptions } from "better-auth";
import type { TransactionalEmailProps } from "#/emails/transactional";
import { reportError } from "#/server/error-reporting";

export type SendAuthEmail = (
	to: string,
	props: TransactionalEmailProps,
	idempotencyKey: string,
) => Promise<string>;

export type VerificationSendGate = {
	reserve: (userId: string) => Promise<boolean>;
	markSent: (userId: string) => Promise<void>;
	release: (userId: string) => Promise<void>;
};

/*
 * One hour, shared by both link types. Better Auth is configured from it and
 * the emails stamp their deadline from it, so the copy can never drift from
 * the token the recipient actually holds.
 */
export const LINK_TTL_SECONDS = 3600;

function expiryFromNow() {
	return new Date(Date.now() + LINK_TTL_SECONDS * 1000);
}

// Tokens must never appear in provider metadata or application logs.
export function emailKey(kind: string, value: string) {
	return `${kind}/${createHash("sha256").update(value).digest("hex")}`;
}

export function authEmailOptions(
	send: SendAuthEmail,
	origin: string,
	configured: boolean,
	verificationGate?: VerificationSendGate,
) {
	return {
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: configured,
			revokeSessionsOnPasswordReset: true,
			resetPasswordTokenExpiresIn: LINK_TTL_SECONDS,
			sendResetPassword: async ({ user, url, token }) => {
				// Keep the public response identical for existing and unknown users,
				// including when delivery fails. Operators get a token-free failure log.
				await send(
					user.email,
					{
						kind: "reset-password",
						name: user.name,
						url,
						expiresAt: expiryFromNow(),
					},
					emailKey("reset", token),
				).catch((error) =>
					reportError(error, {
						component: "email",
						kind: "reset-password",
					}),
				);
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
				).catch((error) =>
					reportError(error, {
						component: "email",
						kind: "password-changed",
					}),
				);
			},
		},
		emailVerification: {
			sendOnSignUp: false,
			autoSignInAfterVerification: true,
			expiresIn: LINK_TTL_SECONDS,
			sendVerificationEmail: async ({ user, url, token }) => {
				if (verificationGate) {
					try {
						if (!(await verificationGate.reserve(user.id))) return;
					} catch (error) {
						reportError(error, { component: "email", kind: "verification" });
						return;
					}
				}
				try {
					await send(
						user.email,
						{
							kind: "verification",
							name: user.name,
							url,
							expiresAt: expiryFromNow(),
						},
						emailKey("verification", token),
					);
				} catch (error) {
					await verificationGate?.release(user.id).catch((releaseError) =>
						reportError(releaseError, {
							component: "email",
							kind: "verification-cooldown",
						}),
					);
					reportError(error, {
						component: "email",
						kind: "verification",
					});
					return;
				}
				await verificationGate?.markSent(user.id).catch((error) =>
					reportError(error, {
						component: "email",
						kind: "verification-cooldown",
					}),
				);
			},
		},
	} satisfies Pick<BetterAuthOptions, "emailAndPassword" | "emailVerification">;
}
