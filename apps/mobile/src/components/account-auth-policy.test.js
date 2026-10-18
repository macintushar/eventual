import { describe, expect, test } from "bun:test";
import { canDisconnect, cooldownSeconds } from "./account-auth-policy.ts";

const google = { id: "g", providerId: "google" };
const credential = { id: "c", providerId: "credential" };
const apple = { id: "a", providerId: "apple" };
const site = { googleSignIn: true, appleSignIn: true };

describe("account disconnect safety", () => {
	test("never removes the only account", () => {
		expect(canDisconnect([google], "g", site, true)).toBe(false);
	});
	test("requires a verified credential fallback", () => {
		expect(canDisconnect([google, credential], "g", site, false)).toBe(false);
		expect(canDisconnect([google, credential], "g", site, true)).toBe(true);
	});
	test("requires a configured social fallback", () => {
		expect(canDisconnect([google, apple], "g", site, false)).toBe(true);
		expect(
			canDisconnect(
				[google, apple],
				"g",
				{ ...site, appleSignIn: false },
				true,
			),
		).toBe(false);
		expect(canDisconnect([google, apple], "g", null, true)).toBe(false);
	});
	test("unknown linked methods don't imply usable login", () => {
		expect(
			canDisconnect(
				[google, { id: "x", providerId: "unknown" }],
				"g",
				site,
				true,
			),
		).toBe(false);
	});
});

test("cooldown uses wall-clock time and expires after backgrounding", () => {
	expect(cooldownSeconds(300_000, 0)).toBe(300);
	expect(cooldownSeconds(300_000, 299_999)).toBe(1);
	expect(cooldownSeconds(300_000, 400_000)).toBe(0);
});
