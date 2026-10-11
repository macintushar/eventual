import { useSyncExternalStore } from "react";
import { authClient } from "#/lib/auth-client";
import {
	LAST_LOGIN_CONSENT_COOKIE,
	LAST_LOGIN_CONSENT_EVENT,
} from "#/lib/last-login-consent";

/**
 * Better Auth keeps the last used login method in a cookie the client plugin
 * can read. The auth screen is server-rendered, so reading it during render
 * would hydrate into a different tree than the server sent. Subscribe to the
 * cookie instead and return nothing on the server and during hydration; the
 * hint appears once the browser takes over.
 */
function subscribe(onChange: () => void) {
	if (typeof window === "undefined") return () => {};
	window.addEventListener("focus", onChange);
	window.addEventListener("cookiechange", onChange);
	window.addEventListener(LAST_LOGIN_CONSENT_EVENT, onChange);
	return () => {
		window.removeEventListener("focus", onChange);
		window.removeEventListener("cookiechange", onChange);
		window.removeEventListener(LAST_LOGIN_CONSENT_EVENT, onChange);
	};
}

function cookieValue(name: string) {
	if (typeof document === "undefined") return null;
	const row = document.cookie
		.split("; ")
		.find((entry) => entry.startsWith(`${name}=`));
	return row ? decodeURIComponent(row.slice(name.length + 1)) : null;
}

/**
 * What the visitor chose on the login screen. "absent" means they have not been
 * asked yet, which is why the toggle only appears when there is already a
 * marker to explain.
 */
export type LastLoginConsent = "granted" | "denied" | "absent";

function consentSnapshot(): LastLoginConsent {
	return (
		(cookieValue(LAST_LOGIN_CONSENT_COOKIE) as LastLoginConsent | null) ??
		"absent"
	);
}

// The server has no access to this cookie's value it did not itself write, so
// hydration starts blank and the real choice lands in the same commit as the
// hint itself.
function consentServerSnapshot(): LastLoginConsent {
	return "absent";
}

export function useLastLoginConsent() {
	return useSyncExternalStore(
		subscribe,
		consentSnapshot,
		consentServerSnapshot,
	);
}

function getSnapshot() {
	return authClient.getLastUsedLoginMethod() ?? "";
}

// Returning the same value as the server snapshot on the first client render
// keeps React from reporting a mismatch while it adopts the cookie.
function getServerSnapshot() {
	return "";
}

export function useLastLoginMethod() {
	const method = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);
	return method || null;
}
