import { createApiKeySchema } from "@eventual/schemas/account";
import {
	FULL_ACCESS_MAX_DAYS,
	type Permissions,
	transactionalKeyPermissions,
	validateKeyPermissions,
} from "@eventual/schemas/permissions";

export type KeyMode = "transactional" | "management" | "custom" | "full";
export const keyModeLabels = {
	transactional: "Transactional",
	management: "Full management",
	custom: "Custom",
	full: "Full account access",
	legacy: "Legacy (unscoped)",
};
export const expiryOptions = [
	{ value: "never", label: "Never" },
	{ value: "7", label: "7 days" },
	{ value: "30", label: "30 days" },
	{ value: "90", label: "90 days" },
	{ value: "365", label: "1 year" },
] as const;
export type KeyExpiry = (typeof expiryOptions)[number]["value"];
export function expiryChoices(mode: KeyMode) {
	return expiryOptions.filter(
		(option) =>
			mode !== "full" ||
			(option.value !== "never" &&
				Number(option.value) <= FULL_ACCESS_MAX_DAYS),
	);
}
export function defaultKeyPermissions(): Permissions {
	return Object.fromEntries(
		Object.entries(transactionalKeyPermissions).map(([resource, actions]) => [
			resource,
			[...actions],
		]),
	);
}
export function createKeyInput(
	name: string,
	mode: KeyMode,
	expiry: KeyExpiry,
	permissions: Permissions,
) {
	if (!expiryChoices(mode).some((option) => option.value === expiry))
		throw new Error(
			"Choose a supported expiry. Full account access must expire within 90 days.",
		);
	if (mode === "custom" && !validateKeyPermissions(permissions))
		throw new Error("Choose at least one supported permission.");
	return createApiKeySchema.parse({
		name,
		mode,
		expiresIn: expiry === "never" ? null : Number(expiry) * 86400,
		...(mode === "custom" ? { permissions } : {}),
	});
}

/** Volatile only: never pass this object to a cache, route, logger or analytics. */
export class OneTimeKeySecret {
	#secret: string | null = null;
	copied = false;
	show(secret: string) {
		this.#secret = secret;
		this.copied = false;
	}
	read() {
		return this.#secret;
	}
	markCopied() {
		if (this.#secret) this.copied = true;
	}
	needsCloseConfirmation() {
		return this.#secret !== null && !this.copied;
	}
	clear() {
		this.#secret = null;
		this.copied = false;
	}
}

type Protection = {
	prevent: () => Promise<void>;
	allow: () => Promise<void>;
	enableSwitcher: () => Promise<void>;
	disableSwitcher: () => Promise<void>;
};
// iOS switcher blur is process-wide, not keyed. Serialize leases so a rapid
// close/reopen cannot let old cleanup disable the new secret's protection.
let previousProtectionRelease: Promise<void> = Promise.resolve();
/** Acquisition completes before any secret is rendered. Cleanup also covers late acquisition and partial failure. */
export function keyProtectionLease(native: Protection) {
	let disposed = false;
	const previous = previousProtectionRelease;
	let release: () => void = () => {};
	previousProtectionRelease = new Promise<void>((resolve) => {
		release = resolve;
	});
	const ready = (async () => {
		await previous;
		if (disposed) return false;
		await native.prevent();
		await native.enableSwitcher();
		return !disposed;
	})();
	let cleanup: Promise<void> | undefined;
	return {
		ready,
		dispose() {
			disposed = true;
			cleanup ??= ready
				.catch(() => {})
				.then(async () => {
					// Attempt both even if one native operation fails; never log errors.
					await Promise.allSettled([
						Promise.resolve().then(() => native.allow()),
						Promise.resolve().then(() => native.disableSwitcher()),
					]);
					release();
				});
			return cleanup;
		},
	};
}
