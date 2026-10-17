/**
 * Where notification permission is offered and how its states read, per
 * docs/mobile-design 05 (D2: after the first successful expense save or
 * invitation accept, never on launch, never on a server without push).
 */

/** Hosted push is the only capability in v1 (05 §E): no self-hosted relay. */
export type PushCapability = "available" | "unavailable-server" | "self-hosted";

export function pushCapability(
	hostedOrigin: string,
	origin: string,
	site:
		| { push: { available: boolean; via: "direct" | "none" } }
		| null
		| undefined,
): PushCapability {
	// v1 advertises push only on the hosted server (docs 05 §E); `via` already
	// carries the direct/none shape so a later relay needs no app change here.
	if (origin !== hostedOrigin) return "self-hosted";
	if (site?.push.available && site.push.via === "direct") return "available";
	return "unavailable-server";
}

/**
 * The app's normalized view of the OS permission. The OS prompt is only ever
 * triggered from an explainer button or the settings screen — never at launch
 * and never as an automatic registration side effect.
 */
export type OsPermission = "undetermined" | "granted" | "denied" | "unknown";

/** Receive Expo's enum from the lazy native module, keeping this policy testable. */
export function normalizeOsPermission(
	response: { granted?: boolean; status?: string; ios?: { status: number } },
	ios: {
		AUTHORIZED: number;
		PROVISIONAL: number;
		EPHEMERAL: number;
		DENIED: number;
		NOT_DETERMINED: number;
	},
): OsPermission {
	if (response.ios) {
		switch (response.ios.status) {
			case ios.AUTHORIZED:
			case ios.PROVISIONAL:
			case ios.EPHEMERAL:
				return "granted";
			case ios.DENIED:
				return "denied";
			case ios.NOT_DETERMINED:
				return "undetermined";
		}
	}
	if (response.granted || response.status === "granted") return "granted";
	if (response.status === "denied") return "denied";
	if (response.status === "undetermined") return "undetermined";
	return "unknown";
}

export type PermissionDecision = "offer" | "idle";

export type ExplainerGate = {
	/** The user just completed a first expense save or accepted an invite. */
	opportunity: boolean;
	/** This device/account combination was already offered once. */
	alreadyOffered: boolean;
	signInStatus: "signed-in" | "signed-out" | "loading" | "disconnected";
	capability: PushCapability;
	osPermission: "undetermined" | "granted" | "denied" | "loading" | "unknown";
};

/**
 * Pure: the D2 explainer only ever appears in context — signed in, on a
 * push-capable server, with a native notifications module, permission still
 * undetermined, and only once (the flag is persisted after either answer, so
 * "Not now" never nags again but also never used the OS prompt).
 */
export function shouldOfferExplainer(gate: ExplainerGate): "offer" | "idle" {
	if (
		gate.opportunity &&
		!gate.alreadyOffered &&
		gate.signInStatus === "signed-in" &&
		gate.capability === "available" &&
		gate.osPermission === "undetermined"
	)
		return "offer";
	return "idle";
}

/** Rows the settings screen renders, in state precedence order. */
export type SettingsState =
	| "loading"
	| "unavailable-server"
	| "unavailable-module"
	| "denied"
	| "not-determined"
	| "granted";

export function notificationSettingsState(input: {
	capability: PushCapability;
	/** Null until the lazily loaded native module has answered. */
	moduleSupported: boolean | null;
	osPermission:
		| "undetermined"
		| "granted"
		| "denied"
		| "loading"
		/** The module answered nothing readable; treat like undetermined. */
		| "unknown";
}): SettingsState {
	if (input.capability !== "available") return "unavailable-server";
	if (input.moduleSupported === false) return "unavailable-module";
	if (input.osPermission === "loading") return "loading";
	if (input.osPermission === "denied") return "denied";
	if (input.osPermission === "undetermined" || input.osPermission === "unknown")
		return "not-determined";
	return "granted";
}
