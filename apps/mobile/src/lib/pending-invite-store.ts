import * as SecureStore from "expo-secure-store";
import { type PendingInvite, parseStoredInvite } from "./pending-invite";

/**
 * The one held invitation. Kept outside React so `+native-intent` can stage
 * it before any component mounts, and in SecureStore so a detour through the
 * mail app (email verification) survives the process being killed.
 */
const STORE_KEY = "eventual_pending_invite";

type Listener = () => void;
let current: PendingInvite | null = null;
const listeners = new Set<Listener>();

function emit() {
	for (const listener of listeners) listener();
}

export function getPendingInvite() {
	return current;
}

export function subscribePendingInvite(listener: Listener) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export async function holdPendingInvite(invite: PendingInvite) {
	// A newer link replaces an older one.
	current = invite;
	emit();
	await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(invite)).catch(
		() => {},
	);
}

export async function clearPendingInvite() {
	current = null;
	emit();
	await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
}

/** On launch: pick up an invite held before the process was killed. */
export async function restorePendingInvite() {
	try {
		const stored = parseStoredInvite(await SecureStore.getItemAsync(STORE_KEY));
		// A link that arrived meanwhile is newer than whatever was stored.
		if (stored && !current) {
			current = stored;
			emit();
		}
	} catch {
		// Nothing stored, or the keychain wasn't readable: carry on without it.
	}
}
