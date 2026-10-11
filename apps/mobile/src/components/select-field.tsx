import { type ReactNode, useState } from "react";
import {
	ActionSheetIOS,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { fonts, useTheme } from "../theme";

export type Option = { value: string; label: string };

type Request = {
	title: string;
	options: Option[];
	current?: string;
	onPick: (value: string) => void;
};

/**
 * Picks one option from a list: the system action sheet on iOS, a bottom
 * list on Android. Render `sheet` once; call `pick` to open it.
 */
export function useOptionPicker(): {
	pick: (request: Request) => void;
	sheet: ReactNode;
} {
	const t = useTheme();
	const [request, setRequest] = useState<Request | null>(null);

	function pick(next: Request) {
		if (Platform.OS !== "ios") return setRequest(next);
		ActionSheetIOS.showActionSheetWithOptions(
			{
				title: next.title,
				options: [...next.options.map((option) => option.label), "Cancel"],
				cancelButtonIndex: next.options.length,
			},
			(index) => {
				if (index < next.options.length) next.onPick(next.options[index].value);
			},
		);
	}

	const sheet =
		Platform.OS === "ios" ? null : (
			<Modal
				visible={request !== null}
				transparent
				animationType="slide"
				onRequestClose={() => setRequest(null)}
			>
				<Pressable
					accessibilityLabel="Close"
					style={{ flex: 1, backgroundColor: "rgba(17,17,17,0.38)" }}
					onPress={() => setRequest(null)}
				/>
				<View
					style={{
						backgroundColor: t.paper,
						borderTopLeftRadius: 28,
						borderTopRightRadius: 28,
						paddingVertical: 12,
						maxHeight: "60%",
					}}
				>
					<Text
						style={{
							fontFamily: fonts.semibold,
							fontSize: 16,
							color: t.mutedInk,
							paddingHorizontal: 24,
							paddingVertical: 8,
						}}
					>
						{request?.title}
					</Text>
					<ScrollView>
						{request?.options.map((option) => (
							<Pressable
								key={option.value}
								android_ripple={{ color: t.border }}
								onPress={() => {
									request.onPick(option.value);
									setRequest(null);
								}}
								style={{ paddingHorizontal: 24, paddingVertical: 16 }}
							>
								<Text
									style={{
										fontFamily:
											option.value === request.current
												? fonts.semibold
												: fonts.body,
										fontSize: 17,
										color: t.ink,
									}}
								>
									{option.label}
								</Text>
							</Pressable>
						))}
					</ScrollView>
				</View>
			</Modal>
		);

	return { pick, sheet };
}

/** A field that looks like the others but picks from a list. */
export function SelectField({
	label,
	value,
	options,
	placeholder = "Choose",
	error,
	onChange,
}: {
	label: string;
	value: string;
	options: Option[];
	placeholder?: string;
	error?: string | null;
	onChange: (value: string) => void;
}) {
	const t = useTheme();
	const picker = useOptionPicker();
	const selected = options.find((option) => option.value === value);

	return (
		<View style={{ gap: 8 }}>
			<Text style={{ fontFamily: fonts.medium, fontSize: 15, color: t.ink }}>
				{label}
			</Text>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${label}: ${selected?.label ?? "not chosen"}`}
				onPress={() =>
					picker.pick({
						title: label,
						options,
						current: value,
						onPick: onChange,
					})
				}
				style={({ pressed }) => ({
					minHeight: 52,
					borderRadius: 14,
					borderWidth: 1,
					borderColor: error ? t.negative : t.input,
					paddingHorizontal: 16,
					flexDirection: "row",
					alignItems: "center",
					backgroundColor: pressed ? t.muted : t.paper,
				})}
			>
				<Text
					style={{
						flex: 1,
						fontFamily: fonts.body,
						fontSize: 17,
						color: selected ? t.ink : t.mutedInk,
					}}
				>
					{selected?.label ?? placeholder}
				</Text>
				<Svg width={16} height={16} viewBox="0 0 24 24">
					<Path
						d="M7 10l5 5 5-5"
						stroke={t.mutedInk}
						strokeWidth={2}
						fill="none"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</Svg>
			</Pressable>
			{error ? (
				<Text
					style={{ fontFamily: fonts.body, fontSize: 14, color: t.negative }}
				>
					{error}
				</Text>
			) : null}
			{picker.sheet}
		</View>
	);
}
