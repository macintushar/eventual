import { describe, expect, test } from "bun:test";
import { IosAuthorizationStatus as ios } from "expo-notifications/src/NotificationPermissions.types";
import {
	normalizeOsPermission,
	notificationSettingsState,
	pushCapability,
	shouldOfferExplainer,
} from "./permissions";

const HOSTED = "https://eventual.macintushar.xyz";
const SELF_HOSTED = "https://self.example.com";
const sitePush = { push: { available: true, via: "direct" } };
const siteNoPush = { push: { available: false, via: "none" } };

// Import only Expo's pure enum definitions, without loading native modules.
test("numeric iOS permission responses include provisional, ephemeral and zero", () => {
	for (const status of [2, 3, 4]) {
		expect(
			normalizeOsPermission(
				{
					granted: status === 2,
					status: status === 2 ? "granted" : "undetermined",
					ios: { status },
				},
				ios,
			),
		).toBe("granted");
	}
	expect(
		normalizeOsPermission(
			{ granted: false, status: "denied", ios: { status: 1 } },
			ios,
		),
	).toBe("denied");
	expect(
		normalizeOsPermission(
			{ granted: false, status: "undetermined", ios: { status: 0 } },
			ios,
		),
	).toBe("undetermined");
	expect(normalizeOsPermission({ granted: true, status: "granted" }, ios)).toBe(
		"granted",
	);
	expect(normalizeOsPermission({ status: "denied" }, ios)).toBe("denied");
	expect(normalizeOsPermission({}, ios)).toBe("unknown");
});

describe("push capability (hosted-only in v1)", () => {
	test("hosted with a direct capability is available", () => {
		expect(pushCapability(HOSTED, HOSTED, sitePush)).toBe("available");
	});

	test("the hosted server without credentials is unavailable", () => {
		expect(pushCapability(HOSTED, HOSTED, siteNoPush)).toBe(
			"unavailable-server",
		);
	});

	test("any other origin is self-hosted, whatever the site claims", () => {
		expect(pushCapability(HOSTED, SELF_HOSTED, sitePush)).toBe("self-hosted");
	});

	test("an unprobed site reads as unavailable, never as available", () => {
		expect(pushCapability(HOSTED, HOSTED, null)).toBe("unavailable-server");
		expect(pushCapability(HOSTED, HOSTED, undefined)).toBe(
			"unavailable-server",
		);
	});
});

describe("the D2 permission explainer", () => {
	const gate = (overrides) => ({
		opportunity: true,
		alreadyOffered: false,
		signInStatus: "signed-in",
		capability: "available",
		osPermission: "undetermined",
		...overrides,
	});

	test("offers exactly in context: signed in, capable, undetermined, once", () => {
		expect(shouldOfferExplainer(gate({}))).toBe("offer");
	});

	test("never offers without the trigger", () => {
		expect(shouldOfferExplainer(gate({ opportunity: false }))).toBe("idle");
	});

	test("never offers on the second successful save (once per device)", () => {
		expect(shouldOfferExplainer(gate({ alreadyOffered: true }))).toBe("idle");
	});

	test("never offers without push capability (self-hosted, no credentials)", () => {
		expect(shouldOfferExplainer(gate({ capability: "self-hosted" }))).toBe(
			"idle",
		);
		expect(
			shouldOfferExplainer(gate({ capability: "unavailable-server" })),
		).toBe("idle");
	});

	test("never offers while signed out or mid-load", () => {
		expect(shouldOfferExplainer(gate({ signInStatus: "signed-out" }))).toBe(
			"idle",
		);
		expect(shouldOfferExplainer(gate({ signInStatus: "loading" }))).toBe(
			"idle",
		);
	});

	test("never offers once permission is already decided", () => {
		expect(shouldOfferExplainer(gate({ osPermission: "granted" }))).toBe(
			"idle",
		);
		expect(shouldOfferExplainer(gate({ osPermission: "denied" }))).toBe("idle");
	});
});

describe("notification settings states", () => {
	test("server availability outranks everything (N-09)", () => {
		expect(
			notificationSettingsState({
				capability: "self-hosted",
				moduleSupported: false,
				osPermission: "granted",
			}),
		).toBe("unavailable-server");
	});

	test("old binaries show the module state, not a broken toggle", () => {
		expect(
			notificationSettingsState({
				capability: "available",
				moduleSupported: false,
				osPermission: "undetermined",
			}),
		).toBe("unavailable-module");
	});

	test("loading, denied, undetermined and granted read distinctly", () => {
		for (const [permission, view] of [
			["loading", "loading"],
			["denied", "denied"],
			["undetermined", "not-determined"],
			["granted", "granted"],
		]) {
			expect(
				notificationSettingsState({
					capability: "available",
					moduleSupported: true,
					osPermission: permission,
				}),
			).toBe(view);
		}
	});
});
