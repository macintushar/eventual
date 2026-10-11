import { afterEach, describe, expect, test } from "bun:test";
import { createEventualClient, EventualApiError } from "@eventual/sdk";
import { onlineManager } from "@tanstack/react-query";
import { createReliabilityQueryClient } from "./query-policy";
import {
	assertOnline,
	networkAvailable,
	OfflineWriteError,
	recoveryDestination,
	returnedToForeground,
	SessionLifecycle,
	safeRecoveryPath,
} from "./reliability";
import { guardSessionApi } from "./session-api";

const revoked = () => new EventualApiError(401, { message: "Revoked" });
const deferred = () => {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
};
afterEach(() => onlineManager.setOnline(true));

describe("session lifecycle", () => {
	function harness() {
		const events = [];
		let clears = 0;
		const session = new SessionLifecycle(
			(...args) => events.push(args),
			() => clears++,
		);
		return { session, events, clears: () => clears };
	}
	test("browser return refreshes verification, deduplicates refreshes", async () => {
		const { session, events } = harness();
		await session.refresh(async () => ({ id: "a", emailVerified: false }));
		const next = deferred();
		const first = session.refresh(() => next.promise);
		expect(
			session.refresh(() => {
				throw new Error("duplicate");
			}),
		).toBe(first);
		next.resolve({ id: "a", emailVerified: true });
		await first;
		expect(events.at(-1)).toEqual([
			{ id: "a", emailVerified: true },
			false,
			false,
		]);
		expect(returnedToForeground("background", "active")).toBe(true);
		expect(returnedToForeground("inactive", "active")).toBe(true);
		expect(returnedToForeground("active", "active")).toBe(false);
	});
	test("offline and 5xx keep verified identity; cold offline never invents one", async () => {
		const { session, events, clears } = harness();
		await session.refresh(async () => {
			throw new TypeError("offline");
		});
		expect(events.at(-1)).toEqual([null, true, false]);
		await session.refresh(async () => ({ id: "a" }));
		for (const error of [new TypeError("offline"), new EventualApiError(503)]) {
			await session.refresh(async () => {
				throw error;
			});
			expect(events.at(-1)).toEqual([{ id: "a" }, true, false]);
		}
		expect(clears()).toBe(1);
	});
	test("401 and null sessions hide data; expiry survives retry until reauthentication", async () => {
		for (const read of [
			async () => {
				throw revoked();
			},
			async () => null,
		]) {
			const { session, events } = harness();
			await session.refresh(async () => ({ id: "a" }));
			await session.refresh(read);
			expect(events.at(-1)).toEqual([null, false, true]);
			await session.refresh(async () => {
				throw new TypeError("offline");
			});
			expect(events.at(-1)).toEqual([null, true, true]);
			await session.refresh(async () => null);
			expect(events.at(-1)).toEqual([null, false, true]);
			await session.refresh(async () => ({ id: "a" }));
			expect(events.at(-1)).toEqual([{ id: "a" }, false, false]);
		}
	});
	test("sign-out/switch ignores late session answers; changed identity clears caches", async () => {
		const { session, events, clears } = harness();
		await session.refresh(async () => ({ id: "a" }));
		const late = deferred();
		const pending = session.refresh(() => late.promise);
		session.reset();
		await session.refresh(async () => ({ id: "b" }));
		late.resolve({ id: "a" });
		await pending;
		expect(events.at(-1)).toEqual([{ id: "b" }, false, false]);
		expect(clears()).toBe(3);
		await session.refresh(async () => ({ id: "c" }));
		expect(clears()).toBe(4);
	});
});

describe("network/write/error policy", () => {
	test("disconnected or unreachable is offline; unknown permits a live attempt", () => {
		expect(
			networkAvailable({ isConnected: true, isInternetReachable: false }),
		).toBe(false);
		expect(networkAvailable({ isConnected: false })).toBe(false);
		expect(networkAvailable({})).toBe(true);
	});
	test("offline mutation rejects now and never replays on reconnect", async () => {
		let calls = 0;
		const client = createReliabilityQueryClient(
			() => {},
			async () => assertOnline(onlineManager.isOnline()),
		);
		onlineManager.setOnline(false);
		const mutation = client
			.getMutationCache()
			.build(client, { mutationFn: async () => calls++ });
		await expect(mutation.execute({})).rejects.toBeInstanceOf(
			OfflineWriteError,
		);
		expect(mutation.state.isPaused).toBe(false);
		onlineManager.setOnline(true);
		await client.resumePausedMutations();
		expect(calls).toBe(0);
		client.clear();
	});
	test("query AND mutation 401s expire, ordinary 403/network errors do not", async () => {
		let expired = 0;
		const client = createReliabilityQueryClient(
			() => expired++,
			async () => {},
		);
		for (const error of [
			revoked(),
			new EventualApiError(403),
			new TypeError("offline"),
		]) {
			await client
				.fetchQuery({
					queryKey: [error.message],
					retry: false,
					queryFn: async () => {
						throw error;
					},
				})
				.catch(() => {});
			const mutation = client.getMutationCache().build(client, {
				mutationFn: async () => {
					throw error;
				},
			});
			await mutation.execute({}).catch(() => {});
		}
		expect(expired).toBe(2);
		expect(client.getDefaultOptions().mutations).toEqual({
			networkMode: "always",
			retry: false,
		});
		expect(client.getDefaultOptions().queries.staleTime).toBe(30_000);
		client.clear();
	});
	test("SDK direct writes are guarded, single-attempt, and late old-user responses rejected", async () => {
		let calls = 0;
		let online = false;
		let epoch = 1;
		let userId = "a";
		let origin = "https://example.com";
		let expired = 0;
		const reply = deferred();
		const raw = createEventualClient({
			baseUrl: origin,
			fetch: async () => {
				calls++;
				return reply.promise;
			},
		});
		const api = guardSessionApi(raw, {
			origin,
			userId,
			snapshot: () => ({ epoch, userId, origin }),
			requireOnline: async () => assertOnline(online),
			expire: () => expired++,
		});
		await expect(
			api.call("group.create", { name: "Trip", currency: "INR" }),
		).rejects.toBeInstanceOf(OfflineWriteError);
		expect(calls).toBe(0);
		online = true;
		const pending = api.call("session.get");
		await Promise.resolve();
		epoch++;
		userId = "b";
		reply.resolve(Response.json(null));
		await expect(pending).rejects.toThrow("Session changed");
		await expect(api.call("app.dashboard")).rejects.toThrow("Session changed");
		origin = "https://other.example.com";
		await expect(api.call("session.get")).rejects.toThrow("Session changed");
		expect(calls).toBe(1);
		expect(expired).toBe(0);
	});
	test("SDK errors expire on 401 without retrying a financial write", async () => {
		let calls = 0;
		let expired = 0;
		const origin = "https://example.com";
		const api = guardSessionApi(
			createEventualClient({
				baseUrl: origin,
				fetch: async () => {
					calls++;
					return Response.json(
						{ error: { message: "Revoked" } },
						{ status: 401 },
					);
				},
			}),
			{
				origin,
				userId: "a",
				snapshot: () => ({ epoch: 1, userId: "a", origin }),
				requireOnline: async () => {},
				expire: () => expired++,
			},
		);
		await expect(
			api.call("group.create", { name: "Trip", currency: "INR" }),
		).rejects.toBeInstanceOf(EventualApiError);
		expect(calls).toBe(1);
		expect(expired).toBe(1);
	});
	test("identity change aborts writes waiting for cookies and masks late 401s", async () => {
		const origin = "https://example.com";
		const session = new SessionLifecycle(
			() => {},
			() => {},
		);
		await session.refresh(async () => ({ id: "a" }));
		const cookie = deferred();
		let aborted = false;
		let expired = 0;
		const api = guardSessionApi(
			createEventualClient({
				baseUrl: origin,
				headers: () => cookie.promise,
				fetch: async (_url, options) => {
					aborted = options.signal.aborted;
					return Response.json({}, { status: 401 });
				},
			}),
			{
				origin,
				userId: "a",
				snapshot: () => ({
					epoch: session.epoch,
					userId: session.user?.id,
					origin,
				}),
				signal: () => session.signal,
				requireOnline: async () => {},
				expire: () => expired++,
			},
		);
		const write = api.call("group.create", { name: "Trip", currency: "INR" });
		await Promise.resolve();
		await Promise.resolve();
		session.reset();
		await session.refresh(async () => ({ id: "b" }));
		cookie.resolve({ cookie: "new-user-cookie" });
		await expect(write).rejects.toThrow("Session changed");
		expect(aborted).toBe(true);
		expect(expired).toBe(0);
	});
});

test("recovery only retains safe internal read destinations", () => {
	const destination = {
		path: "/group/g",
		origin: "https://example.com",
		userId: "a",
	};
	expect(recoveryDestination(destination, destination.origin, "a")).toBe(
		"/group/g",
	);
	expect(recoveryDestination(destination, destination.origin, "b")).toBeNull();
	expect(
		recoveryDestination(destination, "https://other.example.com", "a"),
	).toBeNull();
	for (const path of [
		"/",
		"/activity",
		"/account/profile",
		"/invite/i-1",
		"/group/g-1/expense/e-1",
	])
		expect(safeRecoveryPath(path)).toBe(path);
	for (const path of [
		"https://evil.test",
		"//evil.test",
		"/group/g?token=secret",
		"/sign-in",
		"/new-group",
	])
		expect(safeRecoveryPath(path)).toBeNull();
	expect(safeRecoveryPath("/group/g/expense/compose")).toBe("/group/g");
	expect(safeRecoveryPath("/group/g/record-payment")).toBe("/group/g");
});
