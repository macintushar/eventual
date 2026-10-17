/**
 * An invitation link opened while signed out has to survive sign-in, sign-up
 * and email verification, then open the invite screen. Pure and native-free
 * (the SecureStore-backed holder is `pending-invite-store.ts`) so the binding
 * rules are testable.
 *
 * A held invite belongs to the server whose link it came from. It is dropped,
 * never carried over, when the app points at another server.
 */

/** Long enough for a detour through the mail app, short of a stale link. */
export const PENDING_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "10.0.2.2"];
const LINK =
	/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i;
const INVITE_PATH = /^\/invite\/([\w-]+)\/?$/;

/** Screens a signed-out user can be on; the handoff waits until they leave. */
const AUTH_PATH =
	/^\/(?:sign-in|sign-up|check-email|server|forgot-password|reset-password)$/;

export type InviteLink = {
	invitationId: string;
	/** The server the link names; null when it doesn't say (`eventual://invite/…`). */
	origin: string | null;
};

export type PendingInvite = {
	invitationId: string;
	origin: string;
	savedAt: number;
};

function normalizeOrigin(value: string) {
	return value.trim().replace(/\/+$/, "").toLowerCase().replace(/:443$/, "");
}

function acceptableOrigin(value: string) {
	const origin = normalizeOrigin(value);
	const match = origin.match(/^(https?):\/\/([^/?#:\s]+)(?::\d+)?$/);
	if (!match) return null;
	if (match[1] === "https" || LOCAL_HOSTS.includes(match[2] ?? ""))
		return origin;
	return null;
}

/**
 * The invitation an incoming link points at: a universal link
 * (`https://host/invite/ID`) or the custom-scheme form a self-hosted web page
 * offers (`eventual://invite/ID?origin=https://host`).
 */
export function parseInviteLink(url: string): InviteLink | null {
	const match = url.trim().match(LINK);
	if (!match) return null;
	const scheme = (match[1] ?? "").toLowerCase();
	const host = match[2] ?? "";
	const rest = match[3] ?? "";
	if (scheme === "https" || scheme === "http") {
		const found = rest.match(INVITE_PATH);
		const origin = acceptableOrigin(`${scheme}://${host}`);
		return found?.[1] && origin ? { invitationId: found[1], origin } : null;
	}
	if (scheme !== "eventual") return null;
	// In `eventual://invite/ID` the first segment parses as the host.
	const found = `/${host}${rest}`.match(INVITE_PATH);
	if (!found?.[1]) return null;
	const named = (match[4] ?? "")
		.split("&")
		.map((pair) => pair.split("="))
		.find(([key]) => key === "origin")?.[1];
	if (named === undefined) return { invitationId: found[1], origin: null };
	let decoded: string;
	try {
		decoded = decodeURIComponent(named);
	} catch {
		return null;
	}
	const origin = acceptableOrigin(decoded);
	// A malformed origin is a bad link, not "any server".
	return origin ? { invitationId: found[1], origin } : null;
}

/**
 * What to hold for a link, given the server the app points at. A link that
 * names another server is dropped outright, as push taps are: the invitation
 * id means nothing on a server that didn't issue it.
 */
export function stagePendingInvite(
	link: InviteLink,
	session: { origin: string },
	now: number,
): PendingInvite | null {
	if (
		link.origin &&
		normalizeOrigin(link.origin) !== normalizeOrigin(session.origin)
	)
		return null;
	return {
		invitationId: link.invitationId,
		origin: session.origin,
		savedAt: now,
	};
}

export type InviteAction = "open" | "hold" | "drop";

/**
 * Pure: open it once a session exists on the same server, keep waiting while
 * signed out, and drop it on a server switch or when it's gone stale.
 */
export function settlePendingInvite(
	pending: PendingInvite,
	state: { origin: string; signedIn: boolean; now: number },
): InviteAction {
	const age = state.now - pending.savedAt;
	if (age > PENDING_INVITE_TTL_MS || age < -60_000) return "drop";
	if (normalizeOrigin(pending.origin) !== normalizeOrigin(state.origin))
		return "drop";
	return state.signedIn ? "open" : "hold";
}

/** Only on a screen of the app proper, where pushing the sheet is safe. */
export function canOpenInvite(pathname: string) {
	return !AUTH_PATH.test(pathname);
}

export function inviteHref(invitationId: string) {
	return `/invite/${invitationId}` as const;
}

/** Reads a stored value back; anything unexpected is treated as absent. */
export function parseStoredInvite(raw: string | null): PendingInvite | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<PendingInvite> | null;
		if (
			value &&
			typeof value.invitationId === "string" &&
			/^[\w-]+$/.test(value.invitationId) &&
			typeof value.origin === "string" &&
			typeof value.savedAt === "number"
		)
			return {
				invitationId: value.invitationId,
				origin: value.origin,
				savedAt: value.savedAt,
			};
	} catch {
		// Fall through.
	}
	return null;
}
