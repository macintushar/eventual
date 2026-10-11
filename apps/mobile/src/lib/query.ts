import { isEventualApiError } from "@eventual/sdk";
import {
	focusManager,
	onlineManager,
	QueryCache,
	QueryClient,
} from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState } from "react-native";

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
		setOnline(state.isConnected !== false),
	);
	return () => subscription.remove();
});

export function isUnauthenticated(error: unknown) {
	return isEventualApiError(error) && error.status === 401;
}

export function createQueryClient(onUnauthenticated: () => void) {
	return new QueryClient({
		queryCache: new QueryCache({
			onError: (error) => {
				if (isUnauthenticated(error)) onUnauthenticated();
			},
		}),
		defaultOptions: {
			queries: {
				// Refetch on foreground once data is 30 s old (design §7).
				staleTime: 30_000,
				retry: (count, error) =>
					!isEventualApiError(error) || error.status >= 500 ? count < 2 : false,
			},
		},
	});
}
