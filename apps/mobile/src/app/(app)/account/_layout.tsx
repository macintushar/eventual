import { Stack } from "expo-router";
import { useTheme } from "../../../theme";

export default function AccountLayout() {
	const t = useTheme();
	return (
		<Stack
			screenOptions={{
				headerTransparent: true,
				headerTitle: "",
				headerTintColor: t.ink,
				headerBackButtonDisplayMode: "minimal",
				contentStyle: { backgroundColor: t.canvas },
			}}
		>
			<Stack.Screen name="index" options={{ headerShown: false }} />
		</Stack>
	);
}
