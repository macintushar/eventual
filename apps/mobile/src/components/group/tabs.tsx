import { Host, Spacer } from "@expo/ui/swift-ui";
import {
	accessibilityHidden,
	frame,
	glassEffect,
} from "@expo/ui/swift-ui/modifiers";
import { Activity, Receipt, Scale, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
	AccessibilityInfo,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	useColorScheme,
	useWindowDimensions,
	View,
} from "react-native";
import { fonts, useTheme } from "../../theme";

const sections = [
	{ value: "expenses", label: "Expenses", Icon: Receipt },
	{ value: "balances", label: "Balances", Icon: Scale },
	{ value: "members", label: "Members", Icon: Users },
	{ value: "activity", label: "Activity", Icon: Activity },
] as const;

export type GroupTab = (typeof sections)[number]["value"];

const supportsGlass =
	Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 26;

/** Local section selection, not a second navigation/tab bar. */
export function GroupTabs({
	value,
	onChange,
}: {
	value: GroupTab;
	onChange: (value: GroupTab) => void;
}) {
	const t = useTheme();
	const colorScheme = useColorScheme();
	const { fontScale } = useWindowDimensions();
	const largeText = fontScale > 1.3;
	// Stay opaque until the accessibility preference has been resolved.
	const [reduceTransparency, setReduceTransparency] = useState(true);
	useEffect(() => {
		if (!supportsGlass) return;
		let active = true;
		let preferenceChanged = false;
		const subscription = AccessibilityInfo.addEventListener(
			"reduceTransparencyChanged",
			(enabled) => {
				preferenceChanged = true;
				setReduceTransparency(enabled);
			},
		);
		void AccessibilityInfo.isReduceTransparencyEnabled().then(
			(enabled) => {
				if (active && !preferenceChanged) setReduceTransparency(enabled);
			},
			() => {}, // A failed preference read keeps the accessible opaque fallback.
		);
		return () => {
			active = false;
			subscription.remove();
		};
	}, []);
	const glass = supportsGlass && !reduceTransparency;

	return (
		<View
			accessibilityRole="tablist"
			accessibilityLabel="Group sections"
			style={{
				borderRadius: largeText ? 26 : 999,
				backgroundColor: glass ? "transparent" : t.muted,
			}}
		>
			{glass ? (
				// Real SwiftUI Liquid Glass, not an alpha/blur imitation. Keep this
				// decorative layer separate so RN owns Lucide, layout and tab semantics.
				// The selected pill below is intentionally opaque, not a system Picker.
				<Host
					pointerEvents="none"
					ignoreSafeArea="all"
					colorScheme={colorScheme === "dark" ? "dark" : "light"}
					style={StyleSheet.absoluteFill}
				>
					<Spacer
						modifiers={[
							frame({ maxWidth: Infinity, maxHeight: Infinity }),
							glassEffect({
								glass: { variant: "regular" },
								shape: largeText ? "roundedRectangle" : "capsule",
								cornerRadius: 26,
							}),
							accessibilityHidden(),
						]}
					/>
				</Host>
			) : null}
			<View style={{ flexDirection: "row", flexWrap: "wrap", padding: 4 }}>
				{sections.map(({ value: section, label, Icon }) => {
					const selected = value === section;
					return (
						<Pressable
							key={section}
							testID={`group-tab-${section}`}
							accessibilityRole="tab"
							accessibilityLabel={label}
							accessibilityState={{ selected }}
							onPress={() => onChange(section)}
							style={({ pressed }) => ({
								flexGrow: 1,
								flexBasis: largeText ? "50%" : "25%",
								minHeight: 48,
								paddingHorizontal: 4,
								paddingVertical: 10,
								gap: 4,
								borderRadius: largeText ? 22 : 999,
								alignItems: "center",
								justifyContent: "center",
								backgroundColor: selected ? t.raised : "transparent",
								opacity: pressed ? 0.65 : 1,
							})}
						>
							<Icon
								size={20}
								color={selected ? t.ink : t.mutedInk}
								accessible={false}
							/>
							<Text
								style={{
									fontFamily: selected ? fonts.semibold : fonts.medium,
									fontSize: 14,
									color: selected ? t.ink : t.mutedInk,
									textAlign: "center",
								}}
							>
								{label}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}
