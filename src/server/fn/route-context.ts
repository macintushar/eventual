import { redirect } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

import { buildContext } from "#/server/context";
import { AppError } from "#/server/errors";

/**
 * The page the caller was on, for the `redirect` search param on login. During
 * SSR that is the request itself; for a server function called from the
 * browser it is the referring document.
 */
function callerPath(request: Request) {
	const origin = new URL(request.url).origin;
	for (const candidate of [request.headers.get("referer"), request.url]) {
		if (!candidate) continue;
		try {
			const url = new URL(candidate, origin);
			if (url.origin !== origin) continue;
			if (url.pathname.startsWith("/_serverFn")) continue;
			return `${url.pathname}${url.search}`;
		} catch {
			// Unparseable Referer; fall through to the request URL.
		}
	}
	return undefined;
}

/**
 * Sends the caller to login instead of an error boundary. The client's `/app`
 * guard reads a cached session, so one that expired or was revoked since it
 * last checked surfaces here first.
 */
export function loginRedirect(request: Request = getRequest()): never {
	throw redirect({
		to: "/login",
		search: { redirect: callerPath(request) },
	});
}

/**
 * `buildContext` for the server functions the router calls, as opposed to the
 * HTTP and MCP entry points in `server/http.ts` and `routes/mcp.ts`, which
 * answer an unauthenticated caller with a 401 rather than a redirect.
 */
export async function routeContext() {
	const request = getRequest();
	try {
		return await buildContext(request);
	} catch (error) {
		if (error instanceof AppError && error.code === "UNAUTHENTICATED")
			loginRedirect(request);
		throw error;
	}
}
