import { APIError } from "better-auth/api";

import { type Database, db } from "#/db";
import { auth, presentedApiKey } from "#/lib/auth";
import { AppError } from "#/server/errors";

export type AuthSession = NonNullable<
	Awaited<ReturnType<typeof auth.api.getSession>>
>;
export type Ctx = {
	db: Database;
	user: AuthSession["user"];
	session: AuthSession["session"];
	/** Set when the request authenticated with `x-api-key` instead of a cookie. */
	apiKeyId: string | null;
};

export async function buildContext(request: Request): Promise<Ctx> {
	// A revoked, expired or mistyped API key throws instead of returning null.
	const session = await auth.api
		.getSession({ headers: request.headers })
		.catch((error: unknown) => {
			if (error instanceof APIError)
				throw new AppError("UNAUTHENTICATED", error.message);
			throw error;
		});
	if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
	const presentedKey = presentedApiKey(request.headers);
	return {
		db,
		user: session.user,
		session: session.session,
		apiKeyId: presentedKey ? session.session.id : null,
	};
}
