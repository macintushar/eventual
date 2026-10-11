import { currencyDecimals, currencySymbol } from "@eventual/schemas/currencies";
import { fromMinor } from "@eventual/schemas/money";
import { Pressable, Text, TextInput, View } from "react-native";
import { fonts, useTheme } from "../theme";
import { Body } from "./brand";

/**
 * Money input: the currency's symbol, then tabular digits. The keypad has a
 * decimal key only for currencies that use one (no ¥ cents).
 */
export function AmountField({
	label = "Amount",
	currency,
	value,
	onChange,
	onCurrencyPress,
	hint,
	invalid = false,
}: {
	label?: string;
	currency: string;
	value: string;
	onChange: (value: string) => void;
	/** Shown as a tappable currency chip when given. */
	onCurrencyPress?: () => void;
	hint?: string;
	invalid?: boolean;
}) {
	const t = useTheme();
	const symbol = (
		<Text
			style={{ fontFamily: fonts.semibold, fontSize: 18, color: t.mutedInk }}
		>
			{currencySymbol(currency)}
		</Text>
	);
	return (
		<View style={{ gap: 8 }}>
			<Text style={{ fontFamily: fonts.medium, fontSize: 15, color: t.ink }}>
				{label}
			</Text>
			<View
				style={{
					minHeight: 52,
					borderRadius: 14,
					borderWidth: 1,
					borderColor: invalid ? t.negative : t.input,
					backgroundColor: t.paper,
					flexDirection: "row",
					alignItems: "center",
					paddingLeft: onCurrencyPress ? 6 : 16,
					gap: 6,
				}}
			>
				{onCurrencyPress ? (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={`Currency, ${currency}`}
						onPress={onCurrencyPress}
						style={({ pressed }) => ({
							flexDirection: "row",
							alignItems: "center",
							gap: 4,
							paddingHorizontal: 10,
							paddingVertical: 8,
							borderRadius: 10,
							backgroundColor: pressed ? t.border : t.muted,
						})}
					>
						{symbol}
						<Text
							style={{ fontFamily: fonts.semibold, fontSize: 14, color: t.ink }}
						>
							{currency}
						</Text>
					</Pressable>
				) : (
					symbol
				)}
				<TextInput
					accessibilityLabel={`${label} in ${currency}`}
					value={value}
					onChangeText={onChange}
					placeholder={fromMinor(0, currency)}
					placeholderTextColor={t.mutedInk}
					keyboardType={
						currencyDecimals(currency) === 0 ? "number-pad" : "decimal-pad"
					}
					selectionColor={t.ring}
					style={{
						flex: 1,
						alignSelf: "stretch",
						paddingRight: 16,
						fontFamily: fonts.semibold,
						fontSize: 20,
						color: t.ink,
						fontVariant: ["tabular-nums"],
					}}
				/>
			</View>
			{hint ? (
				<Body tone={invalid ? "negative" : "muted"} size={14}>
					{hint}
				</Body>
			) : null}
		</View>
	);
}
