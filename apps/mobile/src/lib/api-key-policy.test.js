import { describe, expect, test } from "bun:test";
import { apiKeySummarySchema } from "@eventual/schemas/account";
import {
	keyScopeResources,
	statement,
	transactionalKeyPermissions,
} from "@eventual/schemas/permissions";
import {
	createKeyInput,
	defaultKeyPermissions,
	expiryChoices,
	keyProtectionLease,
	OneTimeKeySecret,
} from "./api-key-policy";

describe("API key permissions and expiry", () => {
	test("matches supported seconds/null, trims label, rejects invalid labels", () => {
		for (const [choice, seconds] of [
			["never", null],
			["7", 604800],
			["30", 2592000],
			["90", 7776000],
			["365", 31536000],
		]) {
			expect(
				createKeyInput("  Scripts  ", "transactional", choice, {}).expiresIn,
			).toBe(seconds);
		}
		expect(createKeyInput(" Scripts ", "transactional", "never", {}).name).toBe(
			"Scripts",
		);
		for (const label of ["", "  ", "x".repeat(65)])
			expect(() => createKeyInput(label, "transactional", "7", {})).toThrow();
		expect(() => createKeyInput("Scripts", "transactional", "0", {})).toThrow();
	});
	test("full account access is explicit and cannot be unbounded", () => {
		expect(expiryChoices("full").map((choice) => choice.value)).toEqual([
			"7",
			"30",
			"90",
		]);
		for (const choice of ["never", "365"])
			expect(() => createKeyInput("Scripts", "full", choice, {})).toThrow();
		expect(createKeyInput("Scripts", "full", "90", {}).expiresIn).toBe(
			90 * 86400,
		);
	});
	test("custom scopes use server vocabulary and cannot impersonate accounts", () => {
		for (const row of keyScopeResources)
			for (const action of statement[row.resource]) {
				expect(
					createKeyInput("Scripts", "custom", "never", {
						[row.resource]: [action],
					}).permissions,
				).toEqual({ [row.resource]: [action] });
			}
		for (const permissions of [
			{},
			{ expense: [] },
			{ account: ["impersonate"] },
			{ expense: ["unknown"] },
			{ unknown: ["read"] },
		]) {
			expect(() =>
				createKeyInput("Scripts", "custom", "never", permissions),
			).toThrow();
		}
		expect(
			createKeyInput("Scripts", "transactional", "never", {
				account: ["impersonate"],
			}).permissions,
		).toBeUndefined();
		const custom = defaultKeyPermissions();
		custom.expense.push("delete");
		expect(transactionalKeyPermissions.expense).not.toContain("delete");
	});
});

describe("one-time secret lifecycle", () => {
	test("never serializes secret, confirms uncopied close, clears on exit", () => {
		const secret = new OneTimeKeySecret();
		secret.show("test-only-secret");
		expect(secret.read()).toBe("test-only-secret");
		expect(JSON.stringify(secret)).not.toContain("test-only-secret");
		expect(secret.needsCloseConfirmation()).toBe(true);
		secret.markCopied();
		expect(secret.needsCloseConfirmation()).toBe(false);
		secret.clear();
		expect(secret.read()).toBeNull();
		expect(secret.copied).toBe(false);
		secret.show("another-test-secret");
		expect(secret.needsCloseConfirmation()).toBe(true);
	});
	test("only summaries enter list cache, stripping unexpected secrets", () => {
		const summary = apiKeySummarySchema.parse({
			id: "key-id",
			name: "Scripts",
			start: "ev_ab",
			enabled: true,
			expiresAt: null,
			lastRequest: null,
			createdAt: "2026-10-12T12:00:00Z",
			mode: "transactional",
			key: "test-only-secret",
		});
		expect(summary.key).toBeUndefined();
		expect(JSON.stringify(summary)).not.toContain("test-only-secret");
	});
	test("protection precedes reveal and cleanup is idempotent", async () => {
		const events = [];
		const native = Object.fromEntries(
			["prevent", "enableSwitcher", "allow", "disableSwitcher"].map((name) => [
				name,
				async () => {
					events.push(name);
				},
			]),
		);
		const lease = keyProtectionLease(native);
		expect(await lease.ready).toBe(true);
		expect(events).toEqual(["prevent", "enableSwitcher"]);
		await Promise.all([lease.dispose(), lease.dispose()]);
		expect(events).toEqual([
			"prevent",
			"enableSwitcher",
			"allow",
			"disableSwitcher",
		]);
	});
	test("late native acquisition after unmount never reveals; releases protection", async () => {
		let resolve;
		const pending = new Promise((done) => {
			resolve = done;
		});
		const events = [];
		const lease = keyProtectionLease({
			prevent: () => pending,
			enableSwitcher: async () => {
				events.push("enable");
			},
			allow: async () => {
				events.push("allow");
			},
			disableSwitcher: async () => {
				events.push("disable");
			},
		});
		await Promise.resolve();
		const cleanup = lease.dispose();
		resolve();
		expect(await lease.ready).toBe(false);
		await cleanup;
		expect(events).toEqual(["enable", "allow", "disable"]);
	});
	test("partial failure fails closed and still attempts both cleanups", async () => {
		const events = [];
		const lease = keyProtectionLease({
			prevent: async () => {},
			enableSwitcher: async () => {
				throw new Error("test failure");
			},
			allow: async () => {
				events.push("allow");
				throw new Error("test failure");
			},
			disableSwitcher: async () => {
				events.push("disable");
			},
		});
		await expect(lease.ready).rejects.toThrow("test failure");
		await lease.dispose();
		expect(events).toEqual(["allow", "disable"]);
	});
	test("rapid reopen waits for old native cleanup before acquiring", async () => {
		let release;
		const cleanup = new Promise((done) => {
			release = done;
		});
		const events = [];
		const first = keyProtectionLease({
			prevent: async () => {},
			enableSwitcher: async () => {},
			allow: () => cleanup,
			disableSwitcher: async () => {},
		});
		await first.ready;
		const second = keyProtectionLease({
			prevent: async () => {
				events.push("prevent");
			},
			enableSwitcher: async () => {},
			allow: async () => {},
			disableSwitcher: async () => {},
		});
		const disposing = first.dispose();
		await Promise.resolve();
		expect(events).toEqual([]);
		release();
		await disposing;
		expect(await second.ready).toBe(true);
		expect(events).toEqual(["prevent"]);
		await second.dispose();
	});
});
