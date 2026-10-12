import { parseInviteLink, stagePendingInvite } from "../lib/pending-invite";
import { holdPendingInvite } from "../lib/pending-invite-store";
import { HOSTED_ORIGIN, loadSavedServer } from "../lib/server";

/**
 * Invitation links are held rather than routed: signed out, the sign-in guard
 * would drop the destination. `PendingInviteHandoff` opens the invite once a
 * session exists on the same server. Every other link is left to the router.
 */
/**
 * The launch link is replayed with `initial: true` whenever the router
 * re-initialises, so an invite that was already handled (opened or discarded
 * on a server switch) would otherwise be held again.
 */
let handledInitialPath: string | null = null;

export async function redirectSystemPath({
	path,
	initial,
}: {
	path: string;
	initial: boolean;
}): Promise<string | null> {
	const link = parseInviteLink(path);
	if (!link) return path;
	if (initial) {
		if (handledInitialPath === path) return null;
		handledInitialPath = path;
	}
	try {
		const saved = await loadSavedServer();
		const held = stagePendingInvite(
			link,
			{ origin: saved?.origin ?? HOSTED_ORIGIN },
			Date.now(),
		);
		if (held) await holdPendingInvite(held);
	} catch {
		// An unreadable keychain only costs the redirect.
	}
	return null;
}
