import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventualClient } from "./client";
import { EventualApiError } from "./errors";

type Seen = { url: string; init: RequestInit; headers: Headers };

function fakeFetch(respond: (seen: Seen) => Response) {
	const calls: Seen[] = [];
	const fetch = (async (
		url: string | URL | Request,
		init: RequestInit = {},
	) => {
		const seen = { url: String(url), init, headers: new Headers(init.headers) };
		calls.push(seen);
		return respond(seen);
	}) as typeof globalThis.fetch;
	return { calls, fetch };
}

const group = {
	id: "g1",
	name: "Goa",
	slug: "goa",
	logo: null,
	metadata: null,
	createdAt: "2026-10-01T00:00:00.000Z",
	archivedAt: null,
	myRole: "owner",
	members: [],
};

test("fills path parameters and sends the API key as a bearer token", async () => {
	const { calls, fetch } = fakeFetch(() => Response.json(group));
	const client = createEventualClient({
		baseUrl: "https://eventual.test/",
		apiKey: "ev_123",
		fetch,
	});
	const result = await client.call("group.get", { groupId: "a b/c" });
	assert.equal(result.name, "Goa");
	assert.equal(calls[0].url, "https://eventual.test/api/v1/groups/a%20b%2Fc");
	assert.equal(calls[0].init.method, "GET");
	assert.equal(calls[0].init.body, undefined);
	assert.equal(calls[0].headers.get("authorization"), "Bearer ev_123");
});

test("GET input that isn't in the path goes in the query string", async () => {
	const { calls, fetch } = fakeFetch(() =>
		Response.json({ items: [], nextCursor: null }),
	);
	const client = createEventualClient({
		baseUrl: "https://eventual.test",
		fetch,
	});
	await client.call("expense.page", {
		groupId: "g1",
		from: new Date("2026-01-02T00:00:00.000Z"),
		search: undefined,
		limit: 10,
	});
	const url = new URL(calls[0].url);
	assert.equal(url.pathname, "/api/v2/groups/g1/expenses");
	assert.equal(url.searchParams.get("from"), "2026-01-02T00:00:00.000Z");
	assert.equal(url.searchParams.get("limit"), "10");
	assert.equal(url.searchParams.has("search"), false);
	assert.equal(url.searchParams.has("groupId"), false);
});

test("mutations send JSON bodies without the path fields, plus the idempotency key", async () => {
	const { calls, fetch } = fakeFetch(() => Response.json({ success: true }));
	const client = createEventualClient({
		baseUrl: "https://eventual.test",
		fetch,
	});
	await client.call(
		"member.role",
		{ groupId: "g1", userId: "u1", role: "admin" },
		{ idempotencyKey: "retry-1" },
	);
	assert.equal(
		calls[0].url,
		"https://eventual.test/api/v1/groups/g1/members/u1",
	);
	assert.equal(calls[0].init.method, "PATCH");
	assert.deepEqual(JSON.parse(String(calls[0].init.body)), { role: "admin" });
	assert.equal(calls[0].headers.get("content-type"), "application/json");
	assert.equal(calls[0].headers.get("idempotency-key"), "retry-1");
});

test("endpoints that read their input from the query keep it there", async () => {
	const { calls, fetch } = fakeFetch(() =>
		Response.json({ sent: true, retryAt: "2026-10-01T00:00:00.000Z" }),
	);
	const client = createEventualClient({
		baseUrl: "https://eventual.test",
		fetch,
	});
	await client.call("verification.send", { next: "/app" });
	assert.equal(
		calls[0].url,
		"https://eventual.test/api/v1/pending-verification/send?next=%2Fapp",
	);
	assert.equal(calls[0].init.body, undefined);
});

test("endpoints without required input can be called bare, with async headers", async () => {
	const { calls, fetch } = fakeFetch(() => Response.json([]));
	const client = createEventualClient({
		baseUrl: "https://eventual.test",
		fetch,
		headers: async () => ({ Cookie: "better-auth.session_token=abc" }),
	});
	await client.call("group.list");
	assert.equal(calls[0].headers.get("cookie"), "better-auth.session_token=abc");
});

test("API errors become EventualApiError with the first field message", async () => {
	const { fetch } = fakeFetch(() =>
		Response.json(
			{
				error: {
					code: "VALIDATION",
					message: "Invalid request",
					details: { formErrors: [], fieldErrors: { name: ["Too long"] } },
				},
			},
			{ status: 422 },
		),
	);
	const client = createEventualClient({
		baseUrl: "https://eventual.test",
		fetch,
	});
	await assert.rejects(
		client.call("group.create", { name: "x".repeat(200) }),
		(error: unknown) =>
			error instanceof EventualApiError &&
			error.status === 422 &&
			error.code === "VALIDATION" &&
			error.message === "Name: Too long",
	);
});

test("non-JSON failures still reject with the status", async () => {
	const { fetch } = fakeFetch(
		() => new Response("Bad gateway", { status: 502 }),
	);
	const client = createEventualClient({
		baseUrl: "https://eventual.test",
		fetch,
	});
	await assert.rejects(
		client.call("group.list"),
		(error: unknown) =>
			error instanceof EventualApiError &&
			error.status === 502 &&
			error.code === null,
	);
});

test("validateResponses parses the body with the endpoint's output schema", async () => {
	const { fetch } = fakeFetch(() =>
		Response.json({ ...group, myRole: "boss" }),
	);
	const strict = createEventualClient({
		baseUrl: "https://eventual.test",
		fetch,
		validateResponses: true,
	});
	await assert.rejects(strict.call("group.get", { groupId: "g1" }));
	const loose = createEventualClient({
		baseUrl: "https://eventual.test",
		fetch,
	});
	await loose.call("group.get", { groupId: "g1" });
});

test("file endpoints resolve to a Blob", async () => {
	const { fetch } = fakeFetch(
		() =>
			new Response("date,amount\n", {
				headers: { "Content-Type": "text/csv" },
			}),
	);
	const client = createEventualClient({
		baseUrl: "https://eventual.test",
		fetch,
	});
	const file = await client.call("expense.report", { groupId: "g1" });
	assert.equal(await file.text(), "date,amount\n");
});

test("a missing path parameter fails before any request", async () => {
	const { calls, fetch } = fakeFetch(() => Response.json({}));
	const client = createEventualClient({
		baseUrl: "https://eventual.test",
		fetch,
	});
	await assert.rejects(
		// @ts-expect-error groupId is required
		client.call("group.get", {}),
		/Missing path parameter "groupId"/,
	);
	assert.equal(calls.length, 0);
});

// Compile-time only: inputs and outputs follow the contract.
async function _types() {
	const client = createEventualClient({ baseUrl: "" });
	// @ts-expect-error unknown endpoint
	await client.call("group.nope");
	// @ts-expect-error amountMinor must be a number
	await client.call("expense.create", { groupId: "g", amountMinor: "12" });
	const page = await client.call("app.groupPage", { groupId: "g" });
	const name: string = page.group.name;
	// @ts-expect-error timestamps arrive as strings
	const created: Date = page.group.createdAt;
	return [name, created];
}
void _types;
