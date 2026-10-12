/**
 * UPI handoff for settle-up (05 D12). Eventual only opens the payer's UPI app;
 * it never learns whether money moved, so recording stays manual. The
 * handoff is remembered in memory so that the next return to the app can
 * *ask* whether the payer paid (and only an explicit "Paid" opens the record
 * sheet). Nothing is persisted: if the OS kills the app while the UPI app is
 * in front, the pending handoff is lost and no question is asked. That is
 * acceptable, because the transfer stays on the Settle up list to record.
 */

/** What the payer is settling: a transfer from the group's simplified list. */
export type UpiAttempt = {
	/** Identifies the attempt; a newer attempt for the same transfer replaces it. */
	key: string;
	groupId: string;
	fromUserId: string;
	toUserId: string;
	currency: string;
	amountMinor: number;
};

/**
 * A prompt this old is more likely an unrelated return to the app than the
 * answer to a payment, so it is dropped quietly instead of asked.
 */
export const HANDOFF_MAX_AGE_MS = 30 * 60 * 1000;

export function attemptKey(
	attempt: Omit<UpiAttempt, "key">,
): UpiAttempt["key"] {
	return [
		attempt.groupId,
		attempt.fromUserId,
		attempt.toUserId,
		attempt.currency,
		attempt.amountMinor,
	].join(":");
}

type Pending = {
	attempt: UpiAttempt;
	startedAt: number;
	/** True once the app has been backgrounded after the handoff began. */
	left: boolean;
};

/**
 * One pending handoff at a time. `appStateChanged` returns the attempt to ask
 * about exactly once, on the first background → active after `begin`, and
 * forgets it, so a later return never asks twice.
 */
export class UpiHandoffTracker {
	private pending: Pending | null = null;

	begin(attempt: UpiAttempt, now: number) {
		this.pending = { attempt, startedAt: now, left: false };
	}

	/** Drops the pending handoff, e.g. when the screen goes away. */
	clear() {
		this.pending = null;
	}

	get current(): UpiAttempt | null {
		return this.pending?.attempt ?? null;
	}

	/**
	 * Feed AppState changes. `inactive` is ignored on purpose: iOS also reports
	 * it for the control centre or a system alert, which is not a handoff.
	 */
	appStateChanged(state: string, now: number): UpiAttempt | null {
		const pending = this.pending;
		if (!pending) return null;
		if (state === "background") {
			pending.left = true;
			return null;
		}
		if (state !== "active" || !pending.left) return null;
		this.pending = null;
		return now - pending.startedAt > HANDOFF_MAX_AGE_MS
			? null
			: pending.attempt;
	}
}

/**
 * Payee details from a `upi://pay?pa=…&pn=…` link. Parsed by hand because
 * React Native's `URLSearchParams` has historically lacked `get`.
 */
export function parseUpiUrl(url: string): { vpa: string; name: string } | null {
	const query = url.split("?")[1];
	if (!query || !/^upi:\/\/pay\?/i.test(url)) return null;
	const values = new Map<string, string>();
	for (const pair of query.split("&")) {
		const [rawKey = "", rawValue = ""] = pair.split("=");
		try {
			values.set(
				decodeURIComponent(rawKey.replace(/\+/g, " ")),
				decodeURIComponent(rawValue.replace(/\+/g, " ")),
			);
		} catch {
			// A malformed escape only loses that one field.
		}
	}
	const vpa = values.get("pa")?.trim();
	return vpa ? { vpa, name: values.get("pn")?.trim() ?? "" } : null;
}

/**
 * What lands on the clipboard when no UPI app can be opened: the UPI ID alone,
 * so it pastes cleanly into a payee field. The amount is shown in the alert.
 */
export function fallbackClipboardText(vpa: string) {
	return vpa;
}

export type HandoffOutcome =
	/** The OS accepted the link; a UPI app is in front. */
	| "opened"
	/** No handler: the UPI ID was copied instead. */
	| "copied"
	/** No handler and the clipboard failed too. */
	| "unavailable";

/**
 * Hands off to the UPI app, falling back to the clipboard. The handoff is
 * armed before the OS call and stays armed on the fallback: the payer is told
 * to pay in their own app, so coming back should still ask.
 *
 * Not gated on `Linking.canOpenURL`: it needs `LSApplicationQueriesSchemes`
 * (iOS) and `<queries>` (Android 11+) to answer truthfully and otherwise
 * reports false for installed apps. `openURL` rejects when nothing handles
 * the link on both platforms, which is the accurate signal.
 */
export async function handOffToUpi(
	deps: {
		tracker: UpiHandoffTracker;
		open: (url: string) => Promise<unknown>;
		copy: (text: string) => Promise<boolean>;
		now: () => number;
	},
	attempt: UpiAttempt,
	upiUrl: string,
): Promise<{ outcome: HandoffOutcome; vpa: string | null }> {
	const vpa = parseUpiUrl(upiUrl)?.vpa ?? null;
	deps.tracker.begin(attempt, deps.now());
	try {
		await deps.open(upiUrl);
		return { outcome: "opened", vpa };
	} catch {
		if (!vpa) return { outcome: "unavailable", vpa };
	}
	try {
		const copied = await deps.copy(fallbackClipboardText(vpa));
		return { outcome: copied ? "copied" : "unavailable", vpa };
	} catch {
		return { outcome: "unavailable", vpa };
	}
}
