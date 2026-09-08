import { type Database, db } from "#/db";
import { auth } from "#/lib/auth";
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
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
	const presentedKey = request.headers.get("x-api-key");
	return {
		db,
		user: session.user,
		session: session.session,
		apiKeyId: presentedKey ? session.session.id : null,
	};
}
