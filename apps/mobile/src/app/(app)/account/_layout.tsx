import { Stack } from "expo-router";
import { useTheme } from "../../../theme";

export default function AccountLayout() {
	const t = useTheme();
	return (
		<Stack
			screenOptions={{
				// Transparent, so iOS 26 draws the back button as Liquid Glass;
				// screens carry their own display titles.
				headerTransparent: true,
				headerTitle: "",
				headerTintColor: t.ink,
				headerBackButtonDisplayMode: "minimal",
				contentStyle: { backgroundColor: t.canvas },
			}}
		>
			<Stack.Screen name="index" options={{ headerShown: false }} />
			<Stack.Screen name="profile" />
		</Stack>
	);
}
