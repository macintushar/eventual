import { describe, expect, test } from "bun:test";
import {
	attemptKey,
	fallbackClipboardText,
	HANDOFF_MAX_AGE_MS,
	handOffToUpi,
	parseUpiUrl,
	UpiHandoffTracker,
} from "./upi-handoff";

const base = {
	groupId: "g1",
	fromUserId: "me",
	toUserId: "ben",
	currency: "INR",
	amountMinor: 125000,
};
const attempt = { ...base, key: attemptKey(base) };
const url = "upi://pay?pa=ben%40okbank&pn=Ben+Rao&am=1250.00&cu=INR";

describe("UpiHandoffTracker", () => {
	test("asks once on the first background → active after a handoff", () => {
		const tracker = new UpiHandoffTracker();
		tracker.begin(attempt, 0);
		expect(tracker.appStateChanged("inactive", 1)).toBeNull();
		expect(tracker.appStateChanged("background", 2)).toBeNull();
		expect(tracker.appStateChanged("inactive", 3)).toBeNull();
		expect(tracker.appStateChanged("active", 4)).toEqual(attempt);
		// Answered once, so later returns stay quiet.
		expect(tracker.appStateChanged("background", 5)).toBeNull();
		expect(tracker.appStateChanged("active", 6)).toBeNull();
		expect(tracker.current).toBeNull();
	});

	test("does not ask when the app never left the foreground", () => {
		const tracker = new UpiHandoffTracker();
		tracker.begin(attempt, 0);
		// iOS reports `inactive` for the control centre and system alerts.
		expect(tracker.appStateChanged("inactive", 1)).toBeNull();
		expect(tracker.appStateChanged("active", 2)).toBeNull();
		expect(tracker.current).toEqual(attempt);
	});

	test("does nothing without a pending handoff", () => {
		const tracker = new UpiHandoffTracker();
		expect(tracker.appStateChanged("background", 0)).toBeNull();
		expect(tracker.appStateChanged("active", 1)).toBeNull();
	});

	test("a newer attempt replaces the pending one", () => {
		const tracker = new UpiHandoffTracker();
		const other = { ...attempt, key: "other", toUserId: "cal" };
		tracker.begin(attempt, 0);
		tracker.begin(other, 1);
		tracker.appStateChanged("background", 2);
		expect(tracker.appStateChanged("active", 3)).toEqual(other);
	});

	test("clear forgets the handoff", () => {
		const tracker = new UpiHandoffTracker();
		tracker.begin(attempt, 0);
		tracker.appStateChanged("background", 1);
		tracker.clear();
		expect(tracker.appStateChanged("active", 2)).toBeNull();
	});

	test("drops a stale handoff without asking", () => {
		const tracker = new UpiHandoffTracker();
		tracker.begin(attempt, 0);
		tracker.appStateChanged("background", 1);
		expect(
			tracker.appStateChanged("active", HANDOFF_MAX_AGE_MS + 1),
		).toBeNull();
		expect(tracker.current).toBeNull();
	});

	test("keys differ by transfer", () => {
		expect(attemptKey({ ...base, amountMinor: 1 })).not.toBe(attempt.key);
		expect(attemptKey({ ...base })).toBe(attempt.key);
	});
});

describe("parseUpiUrl", () => {
	test("reads the payee from a pay link", () => {
		expect(parseUpiUrl(url)).toEqual({ vpa: "ben@okbank", name: "Ben Rao" });
	});

	test("rejects links without a payee", () => {
		expect(parseUpiUrl("upi://pay?pn=Ben")).toBeNull();
		expect(parseUpiUrl("https://example.com?pa=a@b")).toBeNull();
		expect(parseUpiUrl("upi://pay")).toBeNull();
	});

	test("survives a malformed escape in another field", () => {
		expect(parseUpiUrl("upi://pay?pn=%E0%A4%A&pa=ben%40okbank")).toEqual({
			vpa: "ben@okbank",
			name: "",
		});
	});
});

describe("handOffToUpi", () => {
	function deps(overrides = {}) {
		const calls = { open: [], copy: [] };
		return {
			calls,
			tracker: new UpiHandoffTracker(),
			now: () => 100,
			open: async (target) => {
				calls.open.push(target);
			},
			copy: async (text) => {
				calls.copy.push(text);
				return true;
			},
			...overrides,
		};
	}

	test("opens the link and arms the handoff", async () => {
		const d = deps();
		const result = await handOffToUpi(d, attempt, url);
		expect(result).toEqual({ outcome: "opened", vpa: "ben@okbank" });
		expect(d.calls.open).toEqual([url]);
		expect(d.calls.copy).toEqual([]);
		expect(d.tracker.current).toEqual(attempt);
	});

	test("copies the UPI ID and amount when nothing handles the link", async () => {
		const d = deps({
			open: async () => {
				throw new Error("no handler");
			},
		});
		const result = await handOffToUpi(d, attempt, url);
		expect(result).toEqual({ outcome: "copied", vpa: "ben@okbank" });
		expect(d.calls.copy).toEqual([fallbackClipboardText("ben@okbank")]);
		expect(fallbackClipboardText("ben@okbank")).toBe("ben@okbank");
		// Still armed: the payer pays in their own app and returns.
		expect(d.tracker.current).toEqual(attempt);
	});

	test("reports unavailable when the clipboard fails too", async () => {
		const failing = async () => {
			throw new Error("nope");
		};
		const rejected = deps({ open: failing, copy: failing });
		expect(await handOffToUpi(rejected, attempt, url)).toEqual({
			outcome: "unavailable",
			vpa: "ben@okbank",
		});
		const refused = deps({ open: failing, copy: async () => false });
		expect((await handOffToUpi(refused, attempt, url)).outcome).toBe(
			"unavailable",
		);
	});

	test("reports unavailable when the link has no payee to copy", async () => {
		const d = deps({
			open: async () => {
				throw new Error("no handler");
			},
		});
		const result = await handOffToUpi(d, attempt, "upi://pay?am=1");
		expect(result).toEqual({ outcome: "unavailable", vpa: null });
		expect(d.calls.copy).toEqual([]);
	});
});
