import { router, usePathname } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import {
	canOpenInvite,
	inviteHref,
	settlePendingInvite,
} from "../lib/pending-invite";
import {
	clearPendingInvite,
	getPendingInvite,
	restorePendingInvite,
	subscribePendingInvite,
} from "../lib/pending-invite-store";
import { useSession } from "../lib/session";
import { Body } from "./brand";

export function usePendingInvite() {
	return useSyncExternalStore(
		subscribePendingInvite,
		getPendingInvite,
		getPendingInvite,
	);
}

/**
 * Opens a held invitation once the session allows it, mounted once from the
 * root layout. Signed out it just waits; on a different server (or when
 * stale) it is discarded rather than opened.
 */
export function PendingInviteHandoff() {
	const { status, origin } = useSession();
	const pathname = usePathname();
	const pending = usePendingInvite();

	useEffect(() => {
		void restorePendingInvite();
	}, []);

	useEffect(() => {
		if (!pending || status === "loading" || status === "disconnected") return;
		const action = settlePendingInvite(pending, {
			origin,
			signedIn: status === "signed-in",
			now: Date.now(),
		});
		if (action === "hold") return;
		if (action === "drop") {
			void clearPendingInvite();
			return;
		}
		// The guard has switched to the app once the path leaves the auth screens.
		if (!canOpenInvite(pathname)) return;
		try {
			// Push, so closing the sheet returns to where the user was.
			router.push(inviteHref(pending.invitationId));
		} catch {
			return;
		}
		void clearPendingInvite();
	}, [pending, status, origin, pathname]);

	return null;
}

/** One quiet line on sign-in and sign-up while an invitation is waiting. */
export function PendingInviteNotice({ action }: { action: string }) {
	const pending = usePendingInvite();
	if (!pending) return null;
	return (
		<Body tone="muted" size={15}>
			{`${action} to accept your invitation.`}
		</Body>
	);
}
