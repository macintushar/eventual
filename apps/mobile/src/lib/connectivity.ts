import { onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { useSyncExternalStore } from "react";
import { assertOnline, networkAvailable } from "./reliability";

export async function refreshConnectivity() {
	try {
		onlineManager.setOnline(
			networkAvailable(await Network.getNetworkStateAsync()),
		);
	} catch {
		// A failed OS check isn't evidence that a session was revoked.
	}
	return onlineManager.isOnline();
}

export async function requireOnline() {
	assertOnline(await refreshConnectivity());
}

export function useOnline() {
	return useSyncExternalStore(
		(listener) => onlineManager.subscribe(listener),
		() => onlineManager.isOnline(),
	);
}
