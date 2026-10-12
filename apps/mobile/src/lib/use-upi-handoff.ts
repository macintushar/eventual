import { formatMinor } from "@eventual/schemas/money";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking } from "react-native";
import {
	attemptKey,
	handOffToUpi,
	type UpiAttempt,
	UpiHandoffTracker,
} from "./upi-handoff";

type Transfer = Omit<UpiAttempt, "key">;

/**
 * Pay-via-UPI for a settle-up row: warn, hand off, then on the next return to
 * the app ask "Did you pay?". Only "Paid" calls `onPaid`; nothing is ever
 * recorded automatically.
 */
export function useUpiHandoff(onPaid: (attempt: UpiAttempt) => void) {
	const [tracker] = useState(() => new UpiHandoffTracker());
	const paid = useRef(onPaid);
	paid.current = onPaid;

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) => {
			const attempt = tracker.appStateChanged(state, Date.now());
			if (!attempt) return;
			Alert.alert(
				"Did you pay?",
				`Did you pay ${formatMinor(attempt.amountMinor, attempt.currency)} in your UPI app? Eventual can’t tell, so it only records a payment when you say so.`,
				[
					{ text: "Not yet", style: "cancel" },
					{ text: "Paid", onPress: () => paid.current(attempt) },
				],
			);
		});
		return () => {
			subscription.remove();
			tracker.clear();
		};
	}, [tracker]);

	function payViaUpi(transfer: Transfer, upiUrl: string) {
		const attempt = { ...transfer, key: attemptKey(transfer) };
		const amount = formatMinor(transfer.amountMinor, transfer.currency);
		Alert.alert(
			"Pay in your UPI app",
			"Eventual opens your UPI app but never records a payment for you. When you come back, you’ll be asked whether you paid.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Open UPI app",
					onPress: () =>
						void handOffToUpi(
							{
								tracker,
								open: (url) => Linking.openURL(url),
								copy: (text) => Clipboard.setStringAsync(text),
								now: Date.now,
							},
							attempt,
							upiUrl,
							amount,
						).then(({ outcome, vpa }) => {
							if (outcome === "copied")
								Alert.alert(
									"No UPI app found",
									`Copied ${vpa} and ${amount} to your clipboard. Pay from any banking app, then come back and confirm. Eventual never records a payment for you.`,
								);
							else if (outcome === "unavailable")
								Alert.alert(
									"No UPI app found",
									vpa
										? `Couldn’t open a UPI app or copy the details. Pay ${amount} to ${vpa} another way, then record it here.`
										: "Install a UPI app, or pay another way and record it here.",
								);
						}),
				},
			],
		);
	}

	return { payViaUpi };
}
