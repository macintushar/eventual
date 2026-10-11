import { Pressable, Text, View } from "react-native";
import { fonts, shadow, useTheme } from "../theme";

/** The web's `.segmented` pill: a muted track with the chosen tab on paper. */
export function Segmented<Value extends string>({
	value,
	options,
	onChange,
}: {
	value: Value;
	options: { value: Value; label: string }[];
	onChange: (value: Value) => void;
}) {
	const t = useTheme();
	return (
		<View
			accessibilityRole="tablist"
			style={{
				flexDirection: "row",
				padding: 4,
				borderRadius: 999,
				borderWidth: 1,
				borderColor: t.border,
				backgroundColor: t.muted,
			}}
		>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<Pressable
						key={option.value}
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						onPress={() => onChange(option.value)}
						style={[
							{
								flex: 1,
								minHeight: 40,
								borderRadius: 999,
								alignItems: "center",
								justifyContent: "center",
								backgroundColor: selected ? t.raised : "transparent",
							},
							selected ? shadow(t) : null,
						]}
					>
						<Text
							style={{
								fontFamily: selected ? fonts.semibold : fonts.medium,
								fontSize: options.length > 3 ? 14 : 15,
								color: selected ? t.ink : t.mutedInk,
							}}
						>
							{option.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}
