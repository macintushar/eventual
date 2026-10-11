import { Platform, useColorScheme } from "react-native";

/** Semantic colours, from apps/web/src/styles.css (see docs/mobile-design 04 §1). */
const light = {
	canvas: "#F3F6F9",
	paper: "#FFFFFF",
	ink: "#000000",
	mutedInk: "#46403F",
	muted: "#E8ECF0",
	/** A surface that sits above `muted`, e.g. the chosen segment. */
	raised: "#FFFFFF",
	border: "#DBD8D6",
	/** Control outlines; firmer than the web's to pass 3:1 (Δ28). */
	input: "#8A8584",
	action: "#000000",
	actionInk: "#FFFFFF",
	positive: "#1F6B45",
	negative: "#B42318",
	warning: "#7A5B00",
	tape: "#3A9EDD",
	ring: "#2A86C4",
	shadow: "#261E1A",
};
const dark: typeof light = {
	canvas: "#111111",
	paper: "#1A1A1A",
	ink: "#F3F3F1",
	mutedInk: "#B5B1AF",
	muted: "#222222",
	raised: "#383838",
	border: "#2E2E2E",
	input: "#6E6E6E",
	action: "#F3F6F9",
	actionInk: "#000000",
	positive: "#6FCB95",
	negative: "#F2806F",
	warning: "#E3CF4A",
	tape: "#3A9EDD",
	ring: "#6BBCEC",
	shadow: "#000000",
};
export type Theme = typeof light;

export function useTheme() {
	return useColorScheme() === "dark" ? dark : light;
}

/**
 * Bundled with the app (expo-font config plugin), so SwiftUI can use them as
 * well. iOS addresses a font by its PostScript name, Android by its file name.
 */
export const fonts = Platform.select({
	ios: {
		display: "InterTight-Medium",
		body: "InstrumentSans-Regular",
		medium: "InstrumentSans-Medium",
		semibold: "InstrumentSans-SemiBold",
		bold: "InstrumentSans-Bold",
	},
	default: {
		display: "InterTight_500Medium",
		body: "InstrumentSans_400Regular",
		medium: "InstrumentSans_500Medium",
		semibold: "InstrumentSans_600SemiBold",
		bold: "InstrumentSans_700Bold",
	},
});

/** The web's soft desk shadows (`--shadow-sm/md`). */
export function shadow(t: Theme, size: "sm" | "md" = "sm") {
	return {
		shadowColor: t.shadow,
		shadowOffset: { width: 0, height: size === "md" ? 14 : 6 },
		shadowOpacity: size === "md" ? 0.12 : 0.08,
		shadowRadius: size === "md" ? 20 : 12,
		elevation: size === "md" ? 3 : 1,
	};
}
