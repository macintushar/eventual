import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "#/db";
import { user } from "#/db/schema";
import { auth } from "#/lib/auth";
import { pendingVerificationCookie } from "#/server/pending-verification";

async function handlePost(request: Request) {
	if (new URL(request.url).pathname !== "/api/auth/sign-in/email")
		return auth.handler(request);

	const body = await request
		.clone()
		.json()
		.catch(() => null);
	const response = await auth.handler(request);
	if (response.status !== 403 || typeof body?.email !== "string")
		return response;
	const error = await response
		.clone()
		.json()
		.catch(() => null);
	if (error?.code !== "EMAIL_NOT_VERIFIED") return response;

	// Better Auth reaches EMAIL_NOT_VERIFIED only after verifying the password.
	const [pendingUser] = await db
		.select({ id: user.id, email: user.email, verified: user.emailVerified })
		.from(user)
		.where(eq(user.email, body.email.toLowerCase()))
		.limit(1);
	if (!pendingUser || pendingUser.verified) return response;
	const headers = new Headers(response.headers);
	headers.append(
		"set-cookie",
		pendingVerificationCookie(pendingUser.id, pendingUser.email),
	);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: ({ request }) => auth.handler(request),
			POST: ({ request }) => handlePost(request),
		},
	},
});
