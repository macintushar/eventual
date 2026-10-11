import { useQueryClient } from "@tanstack/react-query";
import { router, usePathname } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { refreshConnectivity, useOnline } from "../lib/connectivity";
import { recoveryDestination, safeRecoveryPath } from "../lib/reliability";
import { useSession } from "../lib/session";
import { fonts, useTheme } from "../theme";

/** Keeps read-only navigation through expiry; never carries drafts or credentials. */
export function SessionRecovery() {
	const { status, sessionExpired, user, origin } = useSession();
	const pathname = usePathname();
	const last = useRef<{ path: string; userId: string; origin: string } | null>(
		null,
	);
	const pending = useRef<typeof last.current>(null);
	useEffect(() => {
		if (sessionExpired && !pending.current) pending.current = last.current;
		if (status === "signed-in" && user) {
			const destination = pending.current;
			pending.current = null;
			const recoveredPath = recoveryDestination(destination, origin, user.id);
			if (recoveredPath)
				router.replace(recoveredPath as Parameters<typeof router.replace>[0]);
			const path = safeRecoveryPath(pathname);
			if (path) last.current = { path, userId: user.id, origin };
		} else if (!sessionExpired && status === "signed-out") {
			last.current = null;
			pending.current = null;
		}
	}, [status, sessionExpired, user, origin, pathname]);
	return null;
}

export function ReliabilityStatus() {
	const { status, sessionStale, sessionExpired, refreshSession } = useSession();
	const online = useOnline();
	const client = useQueryClient();
	const theme = useTheme();
	const [retrying, setRetrying] = useState(false);
	const cache = client.getQueryCache();
	const failed = useSyncExternalStore(
		(listener) => cache.subscribe(listener),
		() =>
			cache
				.getAll()
				.some(
					(query) =>
						query.getObserversCount() > 0 && query.state.status === "error",
				),
	);
	const message = sessionExpired
		? "Your session expired. Sign in again to continue."
		: status === "disconnected"
			? "Couldn't verify your session. Connect and retry."
			: !online
				? "You're offline. Data may be outdated. Changes aren't queued."
				: sessionStale || failed
					? "Couldn't refresh. Data may be outdated."
					: null;
	if (!message || status === "loading") return null;
	const retry = async () => {
		if (retrying) return;
		setRetrying(true);
		try {
			await refreshConnectivity();
			await refreshSession();
			await client.refetchQueries({ type: "active" });
		} finally {
			setRetrying(false);
		}
	};
	return (
		<SafeAreaView edges={["top"]} style={{ backgroundColor: theme.paper }}>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					paddingHorizontal: 16,
					paddingVertical: 8,
					gap: 12,
				}}
			>
				<Text
					accessibilityLiveRegion="polite"
					style={{ flex: 1, color: theme.ink, fontFamily: fonts.body }}
				>
					{message}
				</Text>
				{!sessionExpired && (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Retry connection and refresh"
						disabled={retrying}
						onPress={() => void retry()}
						style={{ minWidth: 48, minHeight: 48, justifyContent: "center" }}
					>
						<Text style={{ color: theme.ink, fontFamily: fonts.semibold }}>
							{retrying ? "Retrying…" : "Retry"}
						</Text>
					</Pressable>
				)}
			</View>
		</SafeAreaView>
	);
}
