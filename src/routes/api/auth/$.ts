import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "#/db";
import { user } from "#/db/schema";
import { auth, presentedApiKey } from "#/lib/auth";
import { canImpersonate, type Permissions } from "#/lib/permissions";
import { pendingVerificationCookie } from "#/server/pending-verification";

/**
 * Better Auth treats a valid API key as its owner's session
 * (`enableSessionForAPIKeys`), and knows nothing about our scopes. So keys are
 * stopped here unless they opted into full account access, and even then only
 * reach the group and profile endpoints: credentials (password, email,
 * sessions, account deletion, API keys) stay cookie-only for every key.
 */
const KEY_PATHS = ["/api/auth/get-session", "/api/auth/update-user"];
const KEY_PREFIXES = ["/api/auth/organization/"];

async function refuseApiKey(request: Request) {
	const key = presentedApiKey(request.headers);
	if (!key) return null;
	const path = new URL(request.url).pathname;
	if (
		KEY_PATHS.includes(path) ||
		KEY_PREFIXES.some((prefix) => path.startsWith(prefix))
	) {
		const result = await auth.api.verifyApiKey({ body: { key } });
		if (
			result.valid &&
			canImpersonate((result.key?.permissions ?? null) as Permissions | null)
		)
			return null;
	}
	return Response.json(
		{
			code: "FORBIDDEN",
			message: "API keys can't use this endpoint",
		},
		{ status: 403 },
	);
}

async function handleGet(request: Request) {
	return (await refuseApiKey(request)) ?? auth.handler(request);
}

async function handlePost(request: Request) {
	const refused = await refuseApiKey(request);
	if (refused) return refused;
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
			GET: ({ request }) => handleGet(request),
			POST: ({ request }) => handlePost(request),
		},
	},
});
