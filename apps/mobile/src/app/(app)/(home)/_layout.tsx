import { Stack } from "expo-router";
import { useTheme } from "../../../theme";

export default function GroupsLayout() {
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
			<Stack.Screen name="group/[groupId]/index" />
			<Stack.Screen name="group/[groupId]/expense/[expenseId]" />
			<Stack.Screen
				name="group/[groupId]/expense/compose"
				options={{
					headerShown: false,
					presentation: "formSheet",
					sheetAllowedDetents: [1],
					sheetGrabberVisible: true,
					sheetCornerRadius: 28,
				}}
			/>
			<Stack.Screen
				name="group/[groupId]/member/[userId]"
				options={{
					headerShown: false,
					presentation: "formSheet",
					sheetAllowedDetents: [0.75, 1],
					sheetGrabberVisible: true,
					sheetCornerRadius: 28,
				}}
			/>
			<Stack.Screen
				name="group/[groupId]/add-person"
				options={{
					headerShown: false,
					presentation: "formSheet",
					sheetAllowedDetents: [0.75, 1],
					sheetGrabberVisible: true,
					sheetCornerRadius: 28,
				}}
			/>
			<Stack.Screen
				name="new-group"
				options={{
					headerShown: false,
					presentation: "formSheet",
					sheetAllowedDetents: [0.6, 1],
					sheetGrabberVisible: true,
					sheetCornerRadius: 28,
				}}
			/>
			<Stack.Screen
				name="group/[groupId]/record-payment"
				options={{
					headerShown: false,
					presentation: "formSheet",
					sheetAllowedDetents: [0.85, 1],
					sheetGrabberVisible: true,
					sheetCornerRadius: 28,
				}}
			/>
		</Stack>
	);
}
