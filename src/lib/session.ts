import { useEffect, useState } from "react";
import { getSessionFn } from "#/server/fn/auth";

type Session = Awaited<ReturnType<typeof getSessionFn>>;

let cached: Session | undefined;
let inFlight: Promise<Session> | undefined;

/**
 * The session behind the `/app` guard, read from memory on the client.
 *
 * `beforeLoad` runs on every navigation and every hover preload, so asking the
 * server each time put two serial round trips in front of each page. Nothing
 * security-sensitive rests on this cache: every server function re-reads the
 * session from the request headers, and one that has since expired or been
 * revoked redirects to login from there.
 */
export async function loadSession() {
	// Module state lives per-tab in the browser but is shared across every
	// request on the server, so the cache must only ever exist on the client.
	if (import.meta.env.SSR) return getSessionFn();
	if (cached !== undefined) return cached;
	inFlight ??= getSessionFn().then(
		(session) => {
			cached = session;
			inFlight = undefined;
			return session;
		},
		(error: unknown) => {
			inFlight = undefined;
			throw error;
		},
	);
	return inFlight;
}

/** Called wherever auth state changes, so the next guard re-reads the server. */
export function clearSession() {
	cached = undefined;
	inFlight = undefined;
}

/**
 * The signed-in user, resolved on the client after a prerendered page
 * hydrates. Starts `null` (signed-out chrome) and swaps in once
 * `loadSession` resolves, so a prerendered page never bakes in one
 * visitor's session for everyone.
 */
export function useClientUser() {
	const [user, setUser] = useState<{ name: string; email: string } | null>(
		null,
	);

	useEffect(() => {
		let active = true;
		void loadSession().then(
			(session) => {
				if (active) setUser(session?.user ?? null);
			},
			() => {
				if (active) setUser(null);
			},
		);
		return () => {
			active = false;
		};
	}, []);

	return user;
}
