import type { EventualClient } from "@eventual/sdk";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
	normalizeOsPermission,
	type OsPermission,
	pushCapability,
} from "./permissions";
import {
	planRegistration,
	planRetirement,
	type StoredRegistration,
} from "./registration-plan";

/** Re-exported for screens, so Expo module imports stay inside this file. */
export type { OsPermission } from "./permissions";
export type RetireOutcome = "retired" | "cleared" | "idle";

/**
 * Native device registration for hosted push (apps/web PUSH.md, docs 05 §E).
 * Everything native is resolved lazily: an installed app built before
 * expo-notifications simply has no push support and must never crash at
 * startup — `ensureNotificationsModule`/`notificationsSupported` turn that
 * state into a plain "off".
 */

type NotificationsModule = typeof import("expo-notifications");

/** The server sends FCM messages to this channel; the app must create it. */
export const PUSH_CHANNEL_ID = "eventual-activity";

const REGISTRATION_KEY = "eventual_push_registration";

let moduleProbe: Promise<NotificationsModule | null> | undefined;
let supportProbe: Promise<boolean> | undefined;
/** `null` = this binary lacks the native notifications module. */
let handledHandler = false;

export async function ensureNotificationsModule(): Promise<NotificationsModule | null> {
	moduleProbe ??= (async () => {
		try {
			return (await import("expo-notifications")) as NotificationsModule;
		} catch (error) {
			// The JS package might not resolve or its native code is missing:
			// no push, quietly.
			if (__DEV__) console.info("expo-notifications unavailable:", error);
			return null;
		}
	})();
	return moduleProbe;
}

/** True only once the native module actually answers (old binaries: false). */
export async function notificationsSupported(): Promise<boolean> {
	supportProbe ??= (async () => {
		const mod = await ensureNotificationsModule();
		if (!mod) return false;
		try {
			await mod.getPermissionsAsync();
			return true;
		} catch (error) {
			if (__DEV__) console.info("expo-notifications native missing:", error);
			return false;
		}
	})();
	return supportProbe;
}

/** Show foreground pushes inline as banners. */
export async function installNotificationHandler() {
	if (handledHandler) return;
	if (Platform.OS === "web") return;
	const mod = await ensureNotificationsModule();
	if (!mod?.setNotificationHandler) return;
	try {
		mod.setNotificationHandler({
			handleNotification: async () => ({
				shouldShowBanner: true,
				shouldShowList: true,
				shouldPlaySound: true,
				shouldSetBadge: false,
			}),
		});
		handledHandler = true;
	} catch {
		// A stale binary: banner behavior can't be configured; ignore.
	}
}

/** FCM displays nothing on Android 13+ until the channel exists. */
async function ensureAndroidChannel(mod: NotificationsModule) {
	if (Platform.OS !== "android") return;
	try {
		await mod.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
			name: "Activity",
			importance: mod.AndroidImportance.HIGH,
		});
	} catch {
		// Channel creation failing shouldn't block registration retries.
	}
}

/** Registered device memo, scoped by origin+user so nothing crosses accounts. */
async function loadStoredRegistration(): Promise<StoredRegistration | null> {
	try {
		const raw = await SecureStore.getItemAsync(REGISTRATION_KEY);
		if (!raw) return null;
		const saved = JSON.parse(raw) as StoredRegistration;
		return typeof saved.deviceId === "string" &&
			typeof saved.origin === "string" &&
			typeof saved.userId === "string" &&
			typeof saved.token === "string" &&
			typeof saved.appVersion === "string" &&
			(saved.platform === "ios" || saved.platform === "android")
			? saved
			: null;
	} catch {
		return null;
	}
}

function saveStoredRegistration(record: StoredRegistration) {
	return SecureStore.setItemAsync(REGISTRATION_KEY, JSON.stringify(record));
}

function clearStoredRegistration() {
	return SecureStore.deleteItemAsync(REGISTRATION_KEY).catch(() => {});
}

/** Reading can fail on old binaries; every caller already handles that. */
export async function readNotificationPermission(): Promise<OsPermission> {
	const mod = await ensureNotificationsModule();
	if (!mod) return "unknown";
	try {
		return normalizeOsPermission(
			await mod.getPermissionsAsync(),
			mod.IosAuthorizationStatus,
		);
	} catch {
		return "unknown";
	}
}

/** Only ever called from the explainer button or the settings screen. */
export async function requestNotificationPermission(): Promise<OsPermission> {
	const mod = await ensureNotificationsModule();
	if (!mod) return "unknown";
	try {
		return normalizeOsPermission(
			await mod.requestPermissionsAsync(),
			mod.IosAuthorizationStatus,
		);
	} catch {
		return "unknown";
	}
}

function normalizePushToken(token: unknown): string {
	if (typeof token !== "string") return "";
	// APNs tokens may arrive with separators; the server keeps them canonical.
	return token.replace(/\s+/g, "").trim();
}

function currentAppVersion() {
	return Constants.expoConfig?.version ?? "unknown";
}

function deviceLocale(): string {
	try {
		return (
			Intl.DateTimeFormat().resolvedOptions().locale?.slice(0, 100) ?? "en"
		);
	} catch {
		return "en";
	}
}

function timeout(ms: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Fetch the token and register it for this origin+user if the record doesn't
 * already cover both (plus the current app version and token, so rotations
 * re-register). Registration is skipped while offline — the guarded client
 * rejects before any write — and retried on the next trigger.
 */
export async function ensurePushRegistration(
	api: EventualClient,
	options: {
		origin: string;
		userId: string | null;
		/** The only origin serving hosted push in v1. */
		hostedOrigin: string;
		site: { push: { available: boolean; via: "direct" | "none" } } | null;
	},
): Promise<void> {
	const capability = pushCapability(
		options.hostedOrigin,
		options.origin,
		options.site,
	);
	if (capability !== "available") return;
	if (!(await notificationsSupported())) return;
	const mod = await ensureNotificationsModule();
	if (!mod) return;
	const permission = normalizeOsPermission(
		await mod.getPermissionsAsync(),
		mod.IosAuthorizationStatus,
	);
	if (permission !== "granted") return;
	await ensureAndroidChannel(mod);
	if (!options.userId) return;

	let token = "";
	try {
		const deviceToken = await mod.getDevicePushTokenAsync();
		token = normalizePushToken(deviceToken.data);
	} catch {
		return;
	}
	if (!token) return;

	const stored = await loadStoredRegistration();
	const plan = planRegistration({
		userId: options.userId,
		origin: options.origin,
		capability,
		moduleSupported: true,
		osPermission: permission,
		stored,
		currentToken: token,
		appVersion: currentAppVersion(),
	});
	if (plan.action !== "register") return;

	try {
		const device = await api.call("push.device.register", {
			platform: Platform.OS === "ios" ? "ios" : "android",
			token,
			appVersion: currentAppVersion(),
			locale: deviceLocale(),
		});
		await saveStoredRegistration({
			origin: options.origin,
			userId: options.userId,
			platform: Platform.OS === "ios" ? "ios" : "android",
			deviceId: device.id,
			token,
			appVersion: currentAppVersion(),
		});
	} catch (error) {
		// Not queued: registration retries on the next trigger. No financial
		// writes involved, so failure is always acceptable and recoverable.
		if (__DEV__) console.info("push device register skipped:", error);
	}
}

/**
 * Sign-out / server-switch retirement. Deletion must run while the session's
 * cookie is still valid, so the caller awaits this before auth.signOut().
 * Offline: the guarded client throws before the delete hits the network; the
 * stored row stays server-side and is fenced by the next re-registration of
 * the same token (the server reassigns token rows on conflict, with a fresh
 * device id, per apps/web PUSH.md).
 */
export async function retirePushDevice(
	api: EventualClient,
	context: { origin: string; userId: string | null },
): Promise<RetireOutcome> {
	const stored = await loadStoredRegistration();
	const plan = planRetirement({
		origin: context.origin,
		userId: context.userId,
		stored,
	});
	switch (plan.action) {
		case "idle":
			return "idle";
		case "local-clear":
			await clearStoredRegistration();
			return "cleared";
		case "delete-device": {
			try {
				// Sign-out must not hang: the same guarded client enforces
				// online-before-writes, so race that against a short timer.
				await Promise.race([
					api.call("push.device.delete", { deviceId: plan.deviceId }),
					timeout(4000),
				]);
			} catch {
				// Offline/expired: server row stays until token reassigned.
			}
			await clearStoredRegistration();
			return "retired";
		}
	}
}
