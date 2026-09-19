import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	formCsrfMiddleware,
} from "better-auth/api";
import { eq, sql } from "drizzle-orm";
import type { Database } from "#/db";
import { user } from "#/db/schema";
import { emailKey, type SendAuthEmail } from "#/lib/auth-email";
import {
	claimGuest,
	GuestClaimError,
	requestGuestClaim,
} from "#/lib/guest-claim";
import { reportError } from "#/server/error-reporting";
import {
	claimGuestSchema,
	normalizedEmailSchema,
	requestGuestClaimSchema,
} from "#/server/schemas/people";

/** Better Auth 1.5.3 sign-up.mjs checks findUserByEmail BEFORE createUser.
 * password.mjs creates a credential account during reset if none exists.
 * Consequently neither a user.create upsert nor a reset-based claim is safe.
 */
export function guestAuthGuards(db: Database) {
	const assertRegistered = async (userId: string) => {
		const row = await db.query.user.findFirst({ where: eq(user.id, userId) });
		if (!row || row.isGuest)
			throw new APIError("FORBIDDEN", {
				message: "Verify and claim the guest identity first",
			});
	};
	return {
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (typeof ctx.body?.email !== "string") return;
				const email = ctx.body.email.trim().toLowerCase();
				ctx.body.email = email;
				if (
					ctx.path === "/sign-up/email" &&
					!normalizedEmailSchema.safeParse(email).success
				)
					throw new APIError("BAD_REQUEST", {
						message: "Use a deliverable email address",
					});
				if (!["/sign-up/email", "/request-password-reset"].includes(ctx.path))
					return;
				const rows = await db
					.select()
					.from(user)
					.where(sql`lower(trim(${user.email})) = ${email}`);
				if (!rows.some((row) => row.isGuest)) return;
				if (ctx.path === "/request-password-reset")
					return ctx.json({
						status: true,
						message:
							"If this email exists in our system, check your email for the reset link",
					});
				throw new APIError("CONFLICT", {
					code: "GUEST_CLAIM_REQUIRED",
					message:
						"Request a guest claim link to verify this email and keep your expense history",
				});
			}),
		},
		databaseHooks: {
			account: {
				create: {
					before: async (row) => {
						await assertRegistered(row.userId);
					},
				},
				update: {
					before: async (row) => {
						if (row.userId) await assertRegistered(row.userId);
					},
				},
			},
			session: {
				create: {
					before: async (row) => {
						await assertRegistered(row.userId);
					},
				},
			},
		},
	} satisfies Pick<BetterAuthOptions, "hooks" | "databaseHooks">;
}

export function guestAuthPlugin(
	db: Database,
	send: SendAuthEmail,
	origin: string,
	configured: boolean,
) {
	return {
		id: "guest-claim",
		endpoints: {
			requestGuestClaim: createAuthEndpoint(
				"/guest-claim/request",
				{
					method: "POST",
					body: requestGuestClaimSchema,
					use: [formCsrfMiddleware],
				},
				async (ctx) => {
					if (configured)
						await requestGuestClaim(db, ctx.body.email, async (claim) => {
							// The UI reads the fragment and POSTs token + a freshly chosen password.
							// GET/email scanners never consume proof or create credentials.
							const url = new URL("/claim-guest", origin);
							url.hash = new URLSearchParams({ token: claim.token }).toString();
							await send(
								claim.email,
								{
									kind: "verification",
									name: claim.name,
									url: url.toString(),
									expiresAt: claim.expiresAt,
								},
								emailKey("guest-claim", claim.token),
							);
						}).catch(() =>
							reportError(new Error("Guest claim delivery failed"), {
								component: "email",
								kind: "guest-claim",
							}),
						);
					return ctx.json({ success: true });
				},
			),
			claimGuest: createAuthEndpoint(
				"/guest-claim/confirm",
				{ method: "POST", body: claimGuestSchema, use: [formCsrfMiddleware] },
				async (ctx) => {
					try {
						return ctx.json(
							await claimGuest(db, ctx.body, ctx.context.password.hash),
						);
					} catch (error) {
						if (error instanceof GuestClaimError)
							throw new APIError("BAD_REQUEST", { message: error.message });
						throw error;
					}
				},
			),
		},
	} satisfies BetterAuthPlugin;
}
