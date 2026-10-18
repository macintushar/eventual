import { describe, expect, test } from "bun:test";
import { planRegistration, planRetirement } from "./registration-plan";

const ORIGIN = "https://eventual.macintushar.xyz";

const record = (overrides) => ({
	origin: ORIGIN,
	userId: "u/1",
	platform: "ios",
	deviceId: "d/1",
	token: "abc123",
	appVersion: "0.1.0",
	...overrides,
});

const base = {
	userId: "u/1",
	origin: ORIGIN,
	capability: "available",
	moduleSupported: true,
	osPermission: "granted",
	stored: null,
	currentToken: "abc123",
	appVersion: "0.1.0",
};

describe("registration plans (isolation)", () => {
	test("idle when already registered for this origin+user+token+appVersion", () => {
		const plan = planRegistration({
			...base,
			stored: record({}),
			currentToken: "abc123",
			appVersion: "0.1.0",
		});
		expect(plan).toEqual({ action: "idle" });
	});

	test("registers when there is no stored record", () => {
		expect(planRegistration(base)).toEqual({ action: "register" });
	});

	test("re-registers after a token rotation (same user, same app)", () => {
		const plan = planRegistration({
			...base,
			stored: record({ token: "old" }),
			currentToken: "new",
		});
		expect(plan).toEqual({ action: "register" });
	});

	test("re-registers after an app update", () => {
		const plan = planRegistration({
			...base,
			stored: record({}),
			appVersion: "0.2.0",
		});
		expect(plan).toEqual({ action: "register" });
	});

	test("a stored record for another account never blocks the new user", () => {
		const plan = planRegistration({
			...base,
			userId: "u/2",
			stored: record({ userId: "u/1" }),
		});
		expect(plan).toEqual({ action: "register" });
	});

	test("idle without capability, module, permission or a signed-in user", () => {
		const idleInputs = [
			{ ...base, capability: "self-hosted" },
			{ ...base, capability: "unavailable-server" },
			{ ...base, moduleSupported: false },
			{ ...base, osPermission: "undetermined" },
			{ ...base, osPermission: "denied" },
			{ ...base, userId: null },
			{ ...base, currentToken: null },
		];
		for (const input of idleInputs) {
			expect(planRegistration(input)).toEqual({ action: "idle" });
		}
	});
});

describe("retirement plans (no cross-user, no cross-server)", () => {
	test("deletes only this origin's device for the signing-out user", () => {
		expect(
			planRetirement({ userId: "u/1", origin: ORIGIN, stored: record({}) }),
		).toEqual({ action: "delete-device", deviceId: "d/1" });
	});

	test("never deletes another account's device", () => {
		expect(
			planRetirement({
				userId: "u/2",
				origin: ORIGIN,
				stored: record({ userId: "u/1" }),
			}),
		).toEqual({ action: "idle" });
	});

	test("a device on another server is out of this session's reach", () => {
		expect(
			planRetirement({
				userId: "u/1",
				origin: ORIGIN,
				stored: record({ origin: "https://elsewhere.example.com" }),
			}),
		).toEqual({ action: "idle" });
	});

	test("an expired session can only clear the local memo", () => {
		expect(
			planRetirement({ userId: null, origin: ORIGIN, stored: record({}) }),
		).toEqual({ action: "local-clear" });
	});

	test("nothing stored means nothing to do", () => {
		expect(
			planRetirement({ userId: "u/1", origin: ORIGIN, stored: null }),
		).toEqual({ action: "idle" });
	});
});
