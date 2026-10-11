import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState } from "react-native";
import { refreshConnectivity, requireOnline } from "./connectivity";
import { createReliabilityQueryClient } from "./query-policy";
import { networkAvailable } from "./reliability";

// React Query's browser defaults listen for window focus and `online`
// events; on native the equivalents are app state and network state.
focusManager.setEventListener((setFocused) => {
	const subscription = AppState.addEventListener("change", (state) =>
		setFocused(state === "active"),
	);
	return () => subscription.remove();
});
onlineManager.setEventListener((setOnline) => {
	const subscription = Network.addNetworkStateListener((state) =>
		setOnline(networkAvailable(state)),
	);
	void refreshConnectivity();
	return () => subscription.remove();
});

export { isUnauthenticated } from "./reliability";

export function createQueryClient(onUnauthenticated: () => void) {
	return createReliabilityQueryClient(onUnauthenticated, requireOnline);
}
