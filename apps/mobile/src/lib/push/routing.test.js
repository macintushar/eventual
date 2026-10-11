import { describe, expect, test } from "bun:test";
import {
	consumePendingTap,
	destinationAfterAccess,
	resolvePushDestination,
	stagePendingTap,
} from "./routing";

const origin = "https://eventual.macintushar.xyz";
const session = { origin, userId: "u/1" };

const expensePayload = {
	origin,
	userId: "u/1",
	groupId: "g/1",
	expenseId: "e/1",
	type: "expense.created",
};

describe("push tap routing", () => {
	test("routes an expense payload to the expense", () => {
		expect(resolvePushDestination(expensePayload, session)).toEqual({
			kind: "expense",
			groupId: "g/1",
			expenseId: "e/1",
		});
	});

	test("routes a group payload without an expense id to the group", () => {
		expect(
			resolvePushDestination(
				{ ...expensePayload, expenseId: undefined, type: "settlement.created" },
				session,
			),
		).toEqual({ kind: "group", groupId: "g/1" });
	});

	test("drops payloads from another server entirely", () => {
		expect(
			resolvePushDestination(expensePayload, {
				origin: "https://other.example.com",
				userId: "u/1",
			}),
		).toBeNull();
	});

	test("drops payloads addressed to another account", () => {
		expect(
			resolvePushDestination(expensePayload, { origin, userId: "u/2" }),
		).toBeNull();
	});

	test("drops unparseable payloads", () => {
		expect(resolvePushDestination({ groupId: "g/1" }, session)).toBeNull();
		expect(resolvePushDestination(null, session)).toBeNull();
	});

	test("falls back: deleted expense → group activity; unreachable group → home", () => {
		const destination = resolvePushDestination(expensePayload, session);
		expect(
			destinationAfterAccess(destination, {
				expense: "missing",
				group: "granted",
			}),
		).toEqual({ kind: "group", groupId: "g/1" });
		expect(
			destinationAfterAccess(destination, {
				expense: "missing",
				group: "error",
			}),
		).toEqual({ kind: "home" });
		expect(
			destinationAfterAccess(destination, {
				expense: "granted",
				group: "granted",
			}),
		).toEqual({ kind: "expense", groupId: "g/1", expenseId: "e/1" });
	});

	test("a group destination the session can't reach goes home", () => {
		expect(
			destinationAfterAccess(
				{ kind: "group", groupId: "g/1" },
				{ expense: "granted", group: "missing" },
			),
		).toEqual({ kind: "home" });
	});
});

describe("signed-out pending taps", () => {
	test("stages a tap for the saved server only", () => {
		expect(
			stagePendingTap(expensePayload, { origin: "https://other.example.com" }),
		).toBeNull();
		expect(stagePendingTap(expensePayload, { origin })).toEqual({
			origin,
			payload: expensePayload,
		});
	});

	test("a staged tap survives sign-in on the same server and account", () => {
		const pending = stagePendingTap(expensePayload, { origin });
		expect(consumePendingTap(pending, { origin, userId: "u/1" })).toEqual({
			kind: "expense",
			groupId: "g/1",
			expenseId: "e/1",
		});
	});

	test("a staged tap never crosses a switched server", () => {
		const pending = stagePendingTap(expensePayload, { origin });
		expect(
			consumePendingTap(pending, {
				origin: "https://after.example.com",
				userId: "u/1",
			}),
		).toBeNull();
	});

	test("a staged tap never crosses a signed-in account", () => {
		const pending = stagePendingTap(expensePayload, { origin });
		expect(consumePendingTap(pending, { origin, userId: "u/9" })).toBeNull();
	});

	test("without a signed-in user nothing fires", () => {
		const pending = stagePendingTap(expensePayload, { origin });
		expect(consumePendingTap(pending, { origin, userId: null })).toBeNull();
	});
});
