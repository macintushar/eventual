import { Stack } from "expo-router";
import { fonts, useTheme } from "../../theme";

export const unstable_settings = { initialRouteName: "sign-in" };

export default function AuthLayout() {
	const t = useTheme();
	return (
		<Stack
			screenOptions={{
				// Transparent, so iOS 26 draws the back button as Liquid Glass over
				// the canvas; screens carry their own display titles.
				headerTransparent: true,
				headerTitle: "",
				headerTintColor: t.ink,
				headerBackButtonDisplayMode: "minimal",
				headerBackTitleStyle: { fontFamily: fonts.medium },
				contentStyle: { backgroundColor: t.canvas },
			}}
		>
			<Stack.Screen name="sign-in" options={{ headerShown: false }} />
			<Stack.Screen name="sign-up" />
			<Stack.Screen name="check-email" />
			<Stack.Screen name="forgot-password" />
			<Stack.Screen name="reset-password" />
			<Stack.Screen
				name="server"
				options={{
					headerShown: false,
					presentation: "formSheet",
					sheetAllowedDetents: [0.6, 1],
					sheetGrabberVisible: true,
					sheetCornerRadius: 28,
				}}
			/>
		</Stack>
	);
}
