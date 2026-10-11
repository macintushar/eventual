import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import { Appearance } from "react-native";

export type AppearancePreference = "system" | "light" | "dark";

const STORE_KEY = "eventual_appearance";

function apply(preference: AppearancePreference) {
	// Native views (glass, tabs, alerts) follow this too, not just our colours.
	Appearance.setColorScheme(
		preference === "system" ? "unspecified" : preference,
	);
}

function stored(): AppearancePreference {
	const value = SecureStore.getItem(STORE_KEY);
	return value === "light" || value === "dark" ? value : "system";
}

/** Applies the saved choice. Synchronous, so the first frame is already right. */
export function restoreAppearance() {
	apply(stored());
}

/** Settings › Appearance: System (default), Light or Dark. */
export function useAppearancePreference() {
	const [preference, setPreference] = useState(stored);
	return [
		preference,
		(next: AppearancePreference) => {
			setPreference(next);
			apply(next);
			if (next === "system") void SecureStore.deleteItemAsync(STORE_KEY);
			else void SecureStore.setItemAsync(STORE_KEY, next);
		},
	] as const;
}
