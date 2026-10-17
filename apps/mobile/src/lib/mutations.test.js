import { expect, test } from "bun:test";
import { EventualApiError } from "@eventual/sdk";
import { createWriteAttempt } from "./mutations";
import { OfflineWriteError } from "./reliability";

test("a lost response replays original input/key even after editing, without a second write", async () => {
	const attempt = createWriteAttempt();
	const saved = new Map();
	const keys = [];
	let drop = true;
	const original = async (key) => {
		keys.push(key);
		if (!saved.has(key)) saved.set(key, { id: "one", amount: 100 });
		if (drop) {
			drop = false;
			throw new TypeError("response lost");
		}
		return saved.get(key);
	};
	await expect(attempt.run(original)).rejects.toThrow("response lost");
	expect(attempt.unresolved).toBe(true);
	const edited = () => {
		throw new Error("must not send edited input");
	};
	expect(await attempt.run(edited)).toEqual({ id: "one", amount: 100 });
	expect(keys[0]).toBe(keys[1]);
	expect(saved.size).toBe(1);
	expect(attempt.unresolved).toBe(false);
	// A failed post-save refresh must not cause another write either.
	expect(await attempt.run(edited)).toEqual({ id: "one", amount: 100 });
});

test("definitive validation refusal allows corrected input with a new key", async () => {
	const attempt = createWriteAttempt();
	let first;
	await expect(
		attempt.run(async (key) => {
			first = key;
			throw new EventualApiError(400, {
				code: "VALIDATION",
				message: "Invalid",
			});
		}),
	).rejects.toThrow();
	expect(attempt.unresolved).toBe(false);
	await attempt.run(async (key) => {
		expect(key).not.toBe(first);
		return "corrected";
	});
});

test("offline retries and in-progress conflicts retain an uncertain original", async () => {
	const attempt = createWriteAttempt();
	let count = 0;
	const keys = [];
	const send = async (key) => {
		keys.push(key);
		count++;
		if (count === 1) throw new TypeError("lost response");
		if (count === 2) throw new OfflineWriteError();
		if (count === 3)
			throw new EventualApiError(409, {
				code: "CONFLICT",
				message: "in progress",
			});
		return "saved";
	};
	for (let i = 0; i < 3; i++) await expect(attempt.run(send)).rejects.toThrow();
	expect(await attempt.run(send)).toBe("saved");
	expect(new Set(keys).size).toBe(1);
});

test("concurrent submissions share one in-flight write", async () => {
	const attempt = createWriteAttempt();
	let finish;
	const first = attempt.run(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const second = attempt.run(() => {
		throw new Error("duplicate");
	});
	finish("saved");
	expect(await Promise.all([first, second])).toEqual(["saved", "saved"]);
});

test("a changed split releases the old attempt for explicit re-review", async () => {
	const attempt = createWriteAttempt();
	await expect(
		attempt.run(async () => {
			throw new EventualApiError(409, {
				code: "CONFLICT",
				message: "Review split",
				details: { reason: "split_changed" },
			});
		}),
	).rejects.toThrow();
	expect(attempt.unresolved).toBe(false);
	expect(await attempt.run(async () => "reviewed")).toBe("reviewed");
});
