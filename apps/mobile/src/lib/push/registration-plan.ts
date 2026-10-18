/**
 * Pure decision model for device registration (apps/web PUSH.md + docs 05 §E):
 * register native APNs/FCM tokens for the signed-in account on a push-capable
 * server, retire on sign-out/server switch, and never let one account's
 * registration ride another's session. Side effects stay out of here so the
 * isolation rules can be tested directly.
 */
export type RegistrationPlan =
	/** Fetch/refresh the token and POST it for this origin+user. */
	| { action: "register" }
	/** Nothing to do; the stored record already covers this origin+user. */
	| { action: "idle" };

export type StoredRegistration = {
	origin: string;
	userId: string;
	platform: "ios" | "android";
	deviceId: string;
	/** The native token as registered, for rotation detection on later runs. */
	token: string;
	/** The app version that registered it, to re-register after an update. */
	appVersion: string;
};

export type RegistrationInput = {
	/** Signed-in user that the registration must belong to, or null. */
	userId: string | null;
	origin: string;
	capability: "available" | "unavailable-server" | "self-hosted";
	/** Native notifications module resolved for this binary. */
	moduleSupported: boolean;
	osPermission: "granted" | "denied" | "undetermined" | "loading";
	stored: StoredRegistration | null;
	/**
	 * The token for this run. The caller fetches it first; when rotation moved
	 * it, the skip no longer holds and the server upsert fences the old row.
	 */
	currentToken: string | null;
	/** App version of this build, to re-register after an app update. */
	appVersion: string;
};

export function planRegistration(input: RegistrationInput): RegistrationPlan {
	const storedMatches =
		!!input.stored &&
		input.stored.origin === input.origin &&
		input.stored.userId === input.userId &&
		input.stored.token === input.currentToken &&
		input.stored.appVersion === input.appVersion;
	if (
		input.moduleSupported &&
		input.capability === "available" &&
		input.osPermission === "granted" &&
		input.userId &&
		input.origin &&
		!!input.currentToken &&
		!storedMatches
	)
		return { action: "register" };
	return { action: "idle" };
}

export type RetirementInput = {
	/** The account losing its session, if its identity is still known. */
	userId: string | null;
	origin: string;
	stored: StoredRegistration | null;
};

export type RetirementPlan =
	| { action: "delete-device"; deviceId: string }
	| { action: "local-clear" }
	| { action: "idle" };

/**
 * Pure: deletion only happens for a stored device on this origin owned by the
 * signing-out user, while their cookie is still valid. A record for someone
 * else (or another server) is never touched with this session; expired
 * sessions can only clear the local memo, relying on the server's token
 * fencing when the same device registers again later.
 */
export function planRetirement(input: RetirementInput): RetirementPlan {
	const { stored } = input;
	if (!stored) return { action: "idle" };
	if (stored.origin !== input.origin) return { action: "idle" };
	if (!input.userId) return { action: "local-clear" };
	if (stored.userId !== input.userId) return { action: "idle" };
	return { action: "delete-device", deviceId: stored.deviceId };
}
