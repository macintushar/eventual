type Account = { id: string; providerId: string };
type Capabilities = { googleSignIn: boolean; appleSignIn: boolean };

/** The server also enforces its last-account rule and fresh-session check.
 * Be more conservative locally: a disabled/unknown provider isn't a fallback.
 * An unverified credential may require verification on email-enabled servers.
 */
export function canDisconnect(
	accounts: readonly Account[],
	id: string,
	site: Capabilities | null,
	emailVerified: boolean,
) {
	return accounts.some(
		(account) =>
			account.id !== id &&
			((account.providerId === "credential" && emailVerified) ||
				(account.providerId === "google" && site?.googleSignIn === true) ||
				(account.providerId === "apple" && site?.appleSignIn === true)),
	);
}

export const VERIFICATION_COOLDOWN_MS = 5 * 60_000;

export function cooldownSeconds(until: number, now: number) {
	return Math.max(0, Math.ceil((until - now) / 1000));
}
