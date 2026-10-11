/**
 * Consent for the "last used login method" hint.
 *
 * Better Auth writes that marker into a readable, non-essential cookie, so it
 * is only allowed once the visitor opts in. The choice is kept in its own
 * first-party cookie rather than localStorage because Better Auth's
 * `beforeStoreCookie` hook runs on the server and can only read what arrived
 * in the request headers.
 */

/** Absent means "not asked yet", which the server treats as a refusal. */
export const LAST_LOGIN_CONSENT_COOKIE = "ev_last_login_consent";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function consentCookie(granted: boolean) {
	const value = granted ? "granted" : "denied";
	return `${LAST_LOGIN_CONSENT_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
}

function readConsentCookie(header: string | null | undefined) {
	if (!header) return false;
	for (const part of header.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === LAST_LOGIN_CONSENT_COOKIE)
			return decodeURIComponent(rest.join("=")) === "granted";
	}
	return false;
}

/**
 * Server-side half of the toggle: allow the marker cookie only where the
 * visitor already agreed. Returning false leaves authentication untouched,
 * they simply do not get the hint next time.
 */
export function lastLoginConsentFromRequest(
	headers: Headers | undefined,
): boolean {
	return readConsentCookie(headers?.get("cookie"));
}

/**
 * Fired by the toggle after it writes the cookie. `cookiechange` is only
 * dispatched for the async Cookie Store API, never for a `document.cookie`
 * assignment, so the subscribers get their own signal.
 */
export const LAST_LOGIN_CONSENT_EVENT = "ev:last-login-consent";

export function setLastLoginConsent(granted: boolean) {
	if (typeof document === "undefined") return;
	// The Cookie Store API is not available everywhere this app runs, and the
	// mirror has to land before the next request goes out anyway.
	// biome-ignore lint/suspicious/noDocumentCookie: needs to be sync and widely supported
	document.cookie = consentCookie(granted);
	window.dispatchEvent(new Event(LAST_LOGIN_CONSENT_EVENT));
}
