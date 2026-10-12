import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PendingInviteHandoff } from "../components/pending-invite-handoff";
import { PushLifecycle } from "../components/push-lifecycle";
import {
	ReliabilityStatus,
	SessionRecovery,
} from "../components/reliability-status";
import { restoreAppearance } from "../lib/appearance";
import { SessionProvider, useSession } from "../lib/session";

void SplashScreen.preventAutoHideAsync();
restoreAppearance();

export default function RootLayout() {
	return (
		<SessionProvider>
			<SafeAreaProvider>
				<StatusBar style="auto" />
				<View style={{ flex: 1 }}>
					<ReliabilityStatus />
					<SessionRecovery />
					{/* Holds an invitation link through sign-in, then opens it. */}
					<PendingInviteHandoff />
					{/* Registers the native push device, routes taps safely, and
					    hosts the contextual permission explainer. Inert pre-rebuild. */}
					<PushLifecycle />
					<RootNavigator />
				</View>
			</SafeAreaProvider>
		</SessionProvider>
	);
}

function RootNavigator() {
	const { status } = useSession();
	useEffect(() => {
		if (status !== "loading") void SplashScreen.hideAsync();
	}, [status]);
	if (status === "loading") return null;
	// A cold offline launch has no verified identity: show Retry, not private data.
	if (status === "disconnected") return <View style={{ flex: 1 }} />;
	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Protected guard={status === "signed-in"}>
				<Stack.Screen name="(app)" />
			</Stack.Protected>
			<Stack.Protected guard={status === "signed-out"}>
				<Stack.Screen name="(auth)" />
			</Stack.Protected>
		</Stack>
	);
}
