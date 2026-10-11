import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { restoreAppearance } from "../lib/appearance";
import { SessionProvider, useSession } from "../lib/session";

void SplashScreen.preventAutoHideAsync();
restoreAppearance();

export default function RootLayout() {
	return (
		<SessionProvider>
			<StatusBar style="auto" />
			<RootNavigator />
		</SessionProvider>
	);
}

function RootNavigator() {
	const { status } = useSession();
	useEffect(() => {
		if (status !== "loading") void SplashScreen.hideAsync();
	}, [status]);
	if (status === "loading") return null;
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
