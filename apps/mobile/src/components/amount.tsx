import { formatMinor } from "@eventual/schemas/money";
import { type StyleProp, Text, type TextStyle } from "react-native";
import { fonts, useTheme } from "../theme";

/**
 * Money in tabular figures. `signed` colours it by direction and keeps the
 * minus sign; colour is never the only signal (the caller adds a label).
 */
export function Amount({
	minor,
	currency,
	tone = "default",
	size = 17,
	style,
}: {
	minor: number;
	currency: string;
	tone?: "default" | "signed" | "positive" | "negative";
	size?: number;
	style?: StyleProp<TextStyle>;
}) {
	const t = useTheme();
	const color =
		tone === "positive" || (tone === "signed" && minor > 0)
			? t.positive
			: tone === "negative" || (tone === "signed" && minor < 0)
				? t.negative
				: t.ink;
	return (
		<Text
			style={[
				{
					fontFamily: fonts.bold,
					fontSize: size,
					color,
					fontVariant: ["tabular-nums"],
				},
				style,
			]}
		>
			{formatMinor(tone === "signed" ? minor : Math.abs(minor), currency)}
		</Text>
	);
}
