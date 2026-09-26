import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, like, sql } from "drizzle-orm";
import type { Database } from "#/db";
import { account, session, user, verification } from "#/db/schema";
import {
	claimGuestSchema,
	normalizedEmailSchema,
} from "#/server/schemas/people";

export const GUEST_CLAIM_TTL_MS = 60 * 60 * 1000;
const digest = (token: string) =>
	createHash("sha256").update(token).digest("hex");
export class GuestClaimError extends Error {}

/** The token is sent only to the stored email; never returned to the requester.
 * No password is staged before proof, avoiding pre-registration takeover.
 */
export async function requestGuestClaim(
	db: Database,
	email: string,
	send: (claim: {
		email: string;
		name: string;
		token: string;
		expiresAt: Date;
	}) => Promise<void>,
) {
	const normalized = normalizedEmailSchema.parse(email);
	const token = randomBytes(32).toString("hex");
	const delivery = await db.transaction(async (tx) => {
		const rows = await tx
			.select()
			.from(user)
			.where(sql`lower(trim(${user.email})) = ${normalized}`);
		const guest = rows.length === 1 ? rows[0] : undefined;
		if (
			!guest?.isGuest ||
			guest.claimedAt ||
			(await tx.query.account.findFirst({
				where: eq(account.userId, guest.id),
			}))
		)
			return null;
		const now = new Date();
		const expiresAt = new Date(now.getTime() + GUEST_CLAIM_TTL_MS);
		await tx.insert(verification).values({
			id: crypto.randomUUID(),
			identifier: `guest-claim:${guest.id}`,
			value: JSON.stringify({ hash: digest(token), email: guest.email }),
			expiresAt,
			createdAt: now,
			updatedAt: now,
		});
		return { email: guest.email, name: guest.name, token, expiresAt };
	});
	if (delivery) await send(delivery);
	return { success: true as const };
}

export async function claimGuest(
	db: Database,
	raw: { token: string; password: string; name?: string },
	hashPassword: (password: string) => Promise<string>,
) {
	const input = claimGuestSchema.parse(raw);
	const hash = digest(input.token);
	// Hash outside the write transaction; all token/identity checks happen inside.
	const password = await hashPassword(input.password);
	return db.transaction(async (tx) => {
		const candidates = await tx
			.select()
			.from(verification)
			.where(
				and(
					like(verification.identifier, "guest-claim:%"),
					gt(verification.expiresAt, new Date()),
					sql`json_extract(${verification.value}, '$.hash') = ${hash}`,
				),
			);
		const proof = candidates.length === 1 ? candidates[0] : undefined;
		if (!proof) throw new GuestClaimError("Claim link is invalid or expired");
		const userId = proof.identifier.slice("guest-claim:".length);
		const guest = await tx.query.user.findFirst({ where: eq(user.id, userId) });
		const binding = JSON.parse(proof.value) as { email: string };
		if (
			!guest?.isGuest ||
			guest.claimedAt ||
			guest.email !== binding.email ||
			!normalizedEmailSchema.safeParse(guest.email).success ||
			(await tx.query.account.findFirst({ where: eq(account.userId, userId) }))
		)
			throw new GuestClaimError("Claim link is invalid or expired");
		const now = new Date();
		await tx
			.update(user)
			.set({
				isGuest: false,
				claimedAt: now,
				emailVerified: true,
				email: normalizedEmailSchema.parse(guest.email),
				name: input.name ?? guest.name,
				updatedAt: now,
			})
			.where(eq(user.id, userId));
		await tx.insert(account).values({
			id: crypto.randomUUID(),
			userId,
			accountId: userId,
			providerId: "credential",
			password,
			createdAt: now,
			updatedAt: now,
		});
		await tx
			.delete(verification)
			.where(eq(verification.identifier, proof.identifier));
		await tx
			.delete(verification)
			.where(
				and(
					like(verification.identifier, "reset-password:%"),
					eq(verification.value, userId),
				),
			);
		await tx.delete(session).where(eq(session.userId, userId));
		return { success: true as const, userId };
	});
}
