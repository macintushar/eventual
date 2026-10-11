import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../theme";

/**
 * The web's checkbox: ink fill with a tick. With a `blockedReason` the box
 * stays tappable but dimmed, and a tap explains why instead of toggling.
 */
export function Checkbox({
	checked,
	disabled,
	busy,
	blockedReason,
	label,
	onChange,
}: {
	checked: boolean;
	disabled?: boolean;
	busy?: boolean;
	blockedReason?: string | null;
	label: string;
	onChange: (checked: boolean) => void;
}) {
	const t = useTheme();
	return (
		<Pressable
			accessibilityRole="checkbox"
			accessibilityLabel={label}
			accessibilityHint={blockedReason ?? undefined}
			accessibilityState={{
				checked,
				disabled: disabled || Boolean(blockedReason),
				busy,
			}}
			disabled={disabled}
			onPress={() =>
				blockedReason
					? Alert.alert(
							checked ? "Can’t mark this unpaid" : "Can’t mark this paid",
							blockedReason,
						)
					: onChange(!checked)
			}
			hitSlop={12}
			style={{ opacity: blockedReason ? 0.35 : disabled && !busy ? 0.6 : 1 }}
		>
			{busy ? (
				<ActivityIndicator
					color={t.mutedInk}
					style={{ width: 24, height: 24 }}
				/>
			) : (
				<View
					style={{
						width: 24,
						height: 24,
						borderRadius: 7,
						borderWidth: checked ? 0 : 1.5,
						borderColor: t.input,
						backgroundColor: checked ? t.action : t.paper,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					{checked ? (
						<Svg width={14} height={14} viewBox="0 0 24 24">
							<Path
								d="M5 12.5l4.5 4.5L19 7"
								stroke={t.actionInk}
								strokeWidth={3}
								fill="none"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</Svg>
					) : null}
				</View>
			)}
		</Pressable>
	);
}
