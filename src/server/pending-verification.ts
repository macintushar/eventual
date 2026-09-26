import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { db } from "#/db";
import { user, verification } from "#/db/schema";
import { env } from "#/env";

const COOKIE_NAME = "ev_pending_verification";
const PROOF_TTL_MS = 15 * 60_000;
const SEND_COOLDOWN_MS = 5 * 60_000;

type Proof = { userId: string; email: string; expiresAt: number };

function signature(payload: string) {
	return createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(`pending-verification:v1:${payload}`)
		.digest("base64url");
}

export function pendingVerificationCookie(userId: string, email: string) {
	const payload = Buffer.from(
		JSON.stringify({ userId, email, expiresAt: Date.now() + PROOF_TTL_MS }),
	).toString("base64url");
	const secure =
		new URL(env.BETTER_AUTH_URL).protocol === "https:" ? "; Secure" : "";
	return `${COOKIE_NAME}=${payload}.${signature(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${PROOF_TTL_MS / 1000}${secure}`;
}

function readProof(request: Request): Proof | null {
	const value = request.headers
		.get("cookie")
		?.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${COOKIE_NAME}=`))
		?.slice(COOKIE_NAME.length + 1);
	if (!value) return null;
	const [payload, givenSignature] = value.split(".");
	if (!payload || !givenSignature) return null;
	const expected = Buffer.from(signature(payload));
	const given = Buffer.from(givenSignature);
	if (expected.length !== given.length || !timingSafeEqual(expected, given))
		return null;
	try {
		const parsed: unknown = JSON.parse(
			Buffer.from(payload, "base64url").toString(),
		);
		if (!parsed || typeof parsed !== "object") return null;
		const proof = parsed as Partial<Proof>;
		if (
			typeof proof.userId !== "string" ||
			typeof proof.email !== "string" ||
			typeof proof.expiresAt !== "number" ||
			proof.expiresAt <= Date.now()
		)
			return null;
		return proof as Proof;
	} catch {
		return null;
	}
}

export async function pendingVerificationUser(request: Request) {
	if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return null;
	const proof = readProof(request);
	if (!proof) return null;
	const [record] = await db
		.select({ id: user.id, email: user.email })
		.from(user)
		.where(and(eq(user.id, proof.userId), eq(user.emailVerified, false)))
		.limit(1);
	return record?.email === proof.email ? record : null;
}

function markerId(userId: string) {
	return `verification-send:${userId}`;
}

export async function verificationSendStatus(userId: string) {
	const [marker] = await db
		.select({ value: verification.value, expiresAt: verification.expiresAt })
		.from(verification)
		.where(eq(verification.id, markerId(userId)))
		.limit(1);
	if (!marker || marker.expiresAt.getTime() <= Date.now()) return null;
	return marker;
}

export async function reserveVerificationSend(userId: string) {
	const now = new Date();
	const id = markerId(userId);
	const values = {
		id,
		identifier: id,
		value: "pending",
		expiresAt: new Date(now.getTime() + SEND_COOLDOWN_MS),
		createdAt: now,
		updatedAt: now,
	};
	const inserted = await db
		.insert(verification)
		.values(values)
		.onConflictDoNothing()
		.returning({ id: verification.id });
	if (inserted.length > 0) return true;
	const updated = await db
		.update(verification)
		.set({ value: "pending", expiresAt: values.expiresAt, updatedAt: now })
		.where(and(eq(verification.id, id), lte(verification.expiresAt, now)))
		.returning({ id: verification.id });
	return updated.length > 0;
}

export async function markVerificationSent(userId: string) {
	await db
		.update(verification)
		.set({
			value: "sent",
			expiresAt: new Date(Date.now() + SEND_COOLDOWN_MS),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(verification.id, markerId(userId)),
				eq(verification.value, "pending"),
			),
		);
}

export async function releaseVerificationSend(userId: string) {
	await db
		.delete(verification)
		.where(
			and(
				eq(verification.id, markerId(userId)),
				eq(verification.value, "pending"),
			),
		);
}
