import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { type Database, db } from "#/db";
import { user } from "#/db/schema";
import { auth, presentedApiKey } from "#/lib/auth";
import type { Permissions } from "#/lib/permissions";
import { AppError } from "#/server/errors";

export type AuthSession = NonNullable<
	Awaited<ReturnType<typeof auth.api.getSession>>
>;
export type Ctx = {
	db: Database;
	user: AuthSession["user"];
	/** The browser session. Null for API key requests, which never have one. */
	session: AuthSession["session"] | null;
	/** Set when the request authenticated with `x-api-key` instead of a cookie. */
	apiKeyId: string | null;
	/** The key's stored scopes; null for cookie requests and pre-scope keys. */
	apiKeyPermissions: Permissions | null;
};

/**
 * Our API and MCP verify keys here rather than through Better Auth's
 * key-as-session shortcut, so the request carries the key's scopes and every
 * operation checks them. The shortcut is only for full account access keys on
 * Better Auth's own endpoints, gated in src/routes/api/auth/$.ts.
 */
async function apiKeyContext(key: string): Promise<Ctx> {
	const result = await auth.api.verifyApiKey({ body: { key } });
	if (!result.valid || !result.key)
		throw new AppError(
			"UNAUTHENTICATED",
			typeof result.error?.message === "string"
				? result.error.message
				: "Invalid API key",
		);
	const owner = await db.query.user.findFirst({
		where: eq(user.id, result.key.referenceId),
	});
	if (!owner) throw new AppError("UNAUTHENTICATED", "Invalid API key");
	return {
		db,
		user: owner,
		session: null,
		apiKeyId: result.key.id,
		apiKeyPermissions: (result.key.permissions as Permissions | null) ?? null,
	};
}

export async function buildContext(request: Request): Promise<Ctx> {
	const key = presentedApiKey(request.headers);
	if (key) return apiKeyContext(key);
	const session = await auth.api
		.getSession({ headers: request.headers })
		.catch((error: unknown) => {
			if (error instanceof APIError)
				throw new AppError("UNAUTHENTICATED", error.message);
			throw error;
		});
	if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
	return {
		db,
		user: session.user,
		session: session.session,
		apiKeyId: null,
		apiKeyPermissions: null,
	};
}
