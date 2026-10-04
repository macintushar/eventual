import {
	type APIRequestContext,
	type APIResponse,
	expect,
	request as playwrightRequest,
	test,
} from "@playwright/test";

import {
	fullAccessKeyPermissions,
	managementKeyPermissions,
	type Permissions,
	transactionalKeyPermissions,
} from "../../src/lib/permissions";

/**
 * API key scope matrix. Every endpoint comes from the live OpenAPI document —
 * each scoped operation publishes `x-required-scope` — so a new operation is
 * covered the moment it ships, with no list here to update.
 *
 * Keys under test: the two presets, plus one custom key per scope in use,
 * each holding only that scope. For every key and endpoint the scope gate
 * must refuse exactly when the key lacks the scope.
 *
 * Gate checks use ids that don't exist, so a request the gate lets through
 * fails later (validation, membership, not found) without changing data. The
 * happy paths at the bottom then do real work inside the seeded group.
 *
 *   bun run test:keys
 */

const BASE = "http://127.0.0.1:3107";
const GROUP = "G";
const MISSING = "zz-missing";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type SpecOperation = {
	operationId: string;
	method: Method;
	path: string;
	scope: string | null;
	mcpTool: string | null;
	cookieOnly: boolean;
	public: boolean;
};
type Key = { name: string; secret: string; id: string; grants: Permissions };

/** Signed in: creates and revokes keys, and checks state between steps. */
let session: APIRequestContext;
/** No cookies, so the API key is the only credential on the request. */
let bare: APIRequestContext;
const spec: SpecOperation[] = [];
const keys: Key[] = [];

/* Shortcut presets also answer on their pre-/v1 paths. */
const legacyPaths: [string, Method, string][] = [
	["/api/shortcut/groups", "GET", "group:read"],
	["/api/shortcut/groups/{groupId}/members", "GET", "member:read"],
	["/api/shortcut/groups/{groupId}/expenses", "POST", "expense:create"],
];

const allows = (grants: Permissions, scope: string) => {
	const [resource, action] = scope.split(":");
	return Boolean(grants[resource as keyof Permissions]?.includes(action));
};

const fill = (path: string, value = MISSING) =>
	path.replace(/\{[^}]+\}/g, value);

async function send(
	method: Method,
	url: string,
	headers: Record<string, string>,
	context: APIRequestContext = bare,
) {
	return context.fetch(url, {
		method,
		headers: { ...headers, origin: BASE },
		...(method === "GET" ? {} : { data: {} }),
		failOnStatusCode: false,
	});
}

async function json(response: APIResponse) {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

async function createKey(
	name: string,
	body: { mode: string; permissions?: Permissions },
	grants: Permissions,
) {
	const response = await session.post("/api/v1/me/api-keys", {
		data: { name, expiresIn: 86_400, ...body },
		headers: { origin: BASE },
	});
	expect(response.status(), `create ${name}: ${await response.text()}`).toBe(
		200,
	);
	const created = await response.json();
	keys.push({ name, secret: created.key, id: created.record.id, grants });
}

const keyNamed = (name: string) => {
	const key = keys.find((candidate) => candidate.name === name);
	if (!key) throw new Error(`No key ${name}`);
	return key;
};

test.beforeAll(async () => {
	session = await playwrightRequest.newContext({
		baseURL: BASE,
		storageState: "test-results/auth.json",
	});
	/*
	 * The `api` project sets `storageState`, and Playwright seeds every
	 * `newContext()` from it — so a plain newContext still carries the session
	 * cookie and `bare` would not be bare at all. An empty storage state is
	 * what actually makes the key the only credential on the request.
	 */
	bare = await playwrightRequest.newContext({
		baseURL: BASE,
		storageState: { cookies: [], origins: [] },
	});
	const document = await (await session.get("/api/openapi.json")).json();
	for (const [path, methods] of Object.entries(
		document.paths as Record<string, Record<string, Record<string, unknown>>>,
	)) {
		for (const [method, operation] of Object.entries(methods)) {
			const security = (operation.security ?? []) as Record<string, unknown>[];
			const schemes = security.flatMap((entry) => Object.keys(entry));
			spec.push({
				operationId: operation.operationId as string,
				method: method.toUpperCase() as Method,
				path: `/api${path}`,
				scope: (operation["x-required-scope"] as string) ?? null,
				mcpTool: (operation["x-mcp-tool"] as string) ?? null,
				cookieOnly: schemes.length > 0 && !schemes.includes("apiKey"),
				public: schemes.length === 0,
			});
		}
	}
	expect(spec.filter((op) => op.scope).length).toBeGreaterThan(50);

	await createKey(
		"transactional",
		{ mode: "transactional" },
		transactionalKeyPermissions,
	);
	await createKey(
		"management",
		{ mode: "management" },
		managementKeyPermissions,
	);
	await createKey("full", { mode: "full" }, fullAccessKeyPermissions);
	const scopes = [
		...new Set(spec.flatMap((op) => (op.scope ? [op.scope] : []))),
	].sort();
	for (const scope of scopes) {
		const [resource, action] = scope.split(":");
		const grants = { [resource]: [action] } as Permissions;
		await createKey(
			`only ${scope}`,
			{ mode: "custom", permissions: grants },
			grants,
		);
	}
});

test.afterAll(async () => {
	for (const key of keys)
		await session.delete(`/api/v1/me/api-keys/${key.id}`, {
			headers: { origin: BASE },
		});
	await session.dispose();
	await bare.dispose();
});

/* ------------------------------------------------------------ The matrix */

test("every key is gated on every scoped REST endpoint", async () => {
	const mismatches: string[] = [];
	const endpoints = [
		...spec
			.filter((op) => op.scope)
			.map((op) => [op.path, op.method, op.scope as string] as const),
		...legacyPaths,
	];
	for (const key of keys) {
		for (const [path, method, scope] of endpoints) {
			const response = await send(method, fill(path), {
				"x-api-key": key.secret,
			});
			const body = await json(response);
			const denied =
				response.status() === 403 &&
				body?.error?.message === `API key lacks ${scope}`;
			const allowed = allows(key.grants, scope);
			if (denied === allowed || response.status() === 401)
				mismatches.push(
					`${key.name}: ${method} ${path} needs ${scope} → ${response.status()} ${JSON.stringify(body?.error ?? body).slice(0, 120)}`,
				);
		}
	}
	expect(mismatches, mismatches.join("\n")).toEqual([]);
});

test("Bearer keys are gated exactly like x-api-key", async () => {
	const key = keyNamed("transactional");
	const mismatches: string[] = [];
	for (const op of spec.filter((candidate) => candidate.scope)) {
		const response = await send(op.method, fill(op.path), {
			authorization: `Bearer ${key.secret}`,
		});
		const body = await json(response);
		const denied =
			response.status() === 403 &&
			body?.error?.message === `API key lacks ${op.scope}`;
		if (denied === allows(key.grants, op.scope as string))
			mismatches.push(`${op.method} ${op.path} → ${response.status()}`);
	}
	expect(mismatches, mismatches.join("\n")).toEqual([]);
});

const SCOPED_KEYS = ["transactional", "management", "only expense:delete"];

/* Better Auth endpoints a full access key may use; everything else is closed. */
const FULL_ACCESS_AUTH: [Method, string][] = [
	["GET", "/api/auth/get-session"],
	["GET", "/api/auth/organization/list"],
	["POST", "/api/auth/organization/create"],
	["POST", "/api/auth/organization/invite-member"],
	["POST", "/api/auth/organization/remove-member"],
	["POST", "/api/auth/organization/update-member-role"],
	["POST", "/api/auth/update-user"],
];
const CREDENTIAL_AUTH: [Method, string][] = [
	["POST", "/api/auth/change-password"],
	["POST", "/api/auth/change-email"],
	["POST", "/api/auth/set-password"],
	["POST", "/api/auth/delete-user"],
	["GET", "/api/auth/list-sessions"],
	["POST", "/api/auth/revoke-session"],
	["POST", "/api/auth/revoke-sessions"],
	["POST", "/api/auth/revoke-other-sessions"],
	["GET", "/api/auth/list-accounts"],
	["POST", "/api/auth/unlink-account"],
	["POST", "/api/auth/link-social"],
	["GET", "/api/auth/api-key/list"],
	["POST", "/api/auth/api-key/create"],
	["POST", "/api/auth/api-key/update"],
	["POST", "/api/auth/api-key/delete"],
	["POST", "/api/auth/sign-out"],
];

test("scoped keys reach no cookie-only endpoint", async () => {
	const failures: string[] = [];
	for (const key of SCOPED_KEYS.map(keyNamed))
		for (const op of spec.filter((candidate) => candidate.cookieOnly)) {
			const response = await send(op.method, fill(op.path, GROUP), {
				"x-api-key": key.secret,
			});
			if (response.status() !== 403)
				failures.push(
					`${key.name}: ${op.method} ${op.path} → ${response.status()}`,
				);
		}
	expect(failures, failures.join("\n")).toEqual([]);
});

test("scoped keys are refused by every Better Auth endpoint", async () => {
	const failures: string[] = [];
	for (const key of SCOPED_KEYS.map(keyNamed))
		for (const [method, path] of [...FULL_ACCESS_AUTH, ...CREDENTIAL_AUTH]) {
			const response = await send(method, path, { "x-api-key": key.secret });
			if (response.status() !== 403)
				failures.push(`${key.name}: ${method} ${path} → ${response.status()}`);
		}
	expect(failures, failures.join("\n")).toEqual([]);
});

test("full access keys must expire within 90 days", async () => {
	for (const expiresIn of [null, 91 * 86_400, 365 * 86_400]) {
		const response = await session.post("/api/v1/me/api-keys", {
			data: { name: "too long", expiresIn, mode: "full" },
			headers: { origin: BASE },
		});
		expect(response.status(), `expiresIn ${expiresIn}`).toBe(422);
	}
});

test("custom keys can't smuggle in account access", async () => {
	const response = await session.post("/api/v1/me/api-keys", {
		data: {
			name: "smuggler",
			expiresIn: 86_400,
			mode: "custom",
			permissions: { expense: ["read"], account: ["impersonate"] },
		},
		headers: { origin: BASE },
	});
	expect(response.status()).toBe(422);
});

test("a full access key uses the app's own pages and profile", async () => {
	const headers = { "x-api-key": keyNamed("full").secret };
	const failures: string[] = [];
	for (const op of spec.filter((candidate) => candidate.cookieOnly)) {
		const keyManagement = op.path.startsWith("/api/v1/me/api-keys");
		const response = await send(op.method, fill(op.path, GROUP), headers);
		// Key management stays cookie-only; the rest is reachable (a body-less
		// PATCH may still fail validation, which is past the gate).
		const refused = response.status() === 403;
		if (refused !== keyManagement)
			failures.push(`${op.method} ${op.path} → ${response.status()}`);
	}
	expect(failures, failures.join("\n")).toEqual([]);
	const dashboard = await send("GET", "/api/v1/app/dashboard", headers);
	expect(dashboard.status()).toBe(200);
});

test("a full access key acts as its owner on Better Auth, but never on credentials", async () => {
	const headers = { "x-api-key": keyNamed("full").secret };
	const whoami = await json(
		await send("GET", "/api/auth/get-session", headers),
	);
	expect(whoami?.user?.id).toBe("A");
	const groups = await send("GET", "/api/auth/organization/list", headers);
	expect(groups.status()).toBe(200);
	const failures: string[] = [];
	for (const [method, path] of FULL_ACCESS_AUTH) {
		const response = await send(method, path, headers);
		if (response.status() === 403 || response.status() === 401)
			failures.push(`allowed ${method} ${path} → ${response.status()}`);
	}
	for (const [method, path] of CREDENTIAL_AUTH) {
		const response = await send(method, path, headers);
		if (response.status() !== 403)
			failures.push(`credential ${method} ${path} → ${response.status()}`);
	}
	expect(failures, failures.join("\n")).toEqual([]);
	// Still signed in, still owns their keys.
	const mine = await session.get("/api/v1/me/api-keys");
	expect(mine.status()).toBe(200);
});

test("MCP lists exactly the tools each key may call", async () => {
	const mismatches: string[] = [];
	for (const key of keys) {
		const response = await bare.post("/mcp", {
			headers: {
				"x-api-key": key.secret,
				accept: "application/json, text/event-stream",
			},
			data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
		});
		const body = await json(response);
		const listed = new Set<string>(
			(body?.result?.tools ?? []).map((tool: { name: string }) => tool.name),
		);
		const expected = new Set(
			spec
				.filter((op) => op.mcpTool && op.scope && allows(key.grants, op.scope))
				.map((op) => op.mcpTool as string),
		);
		const extra = [...listed].filter((tool) => !expected.has(tool));
		const missing = [...expected].filter((tool) => !listed.has(tool));
		if (extra.length || missing.length)
			mismatches.push(
				`${key.name}: extra [${extra}] missing [${missing}] (${response.status()} ${JSON.stringify(body?.error ?? "").slice(0, 100)})`,
			);
	}
	expect(mismatches, mismatches.join("\n")).toEqual([]);
});

test("MCP refuses a tool outside the key's scopes", async () => {
	const before = await (
		await session.get(`/api/v2/groups/${GROUP}/expenses?limit=1`)
	).json();
	const response = await bare.post("/mcp", {
		headers: {
			"x-api-key": keyNamed("only balance:read").secret,
			accept: "application/json, text/event-stream",
		},
		data: {
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: {
				name: "createExpense",
				arguments: {
					groupId: GROUP,
					description: "Should never exist",
					amountMinor: 100,
					currency: "INR",
					paidByUserId: "A",
					splitMethod: "even",
					date: new Date().toISOString(),
					participants: [{ userId: "A", input: null }],
				},
			},
		},
	});
	const body = await json(response);
	expect(JSON.stringify(body)).toMatch(/not found/i);
	const after = await (
		await session.get(`/api/v2/groups/${GROUP}/expenses?limit=1`)
	).json();
	expect(after.items[0]?.id).toBe(before.items[0]?.id);
});

/* ------------------------------------------------------ Real group work */

test.describe
	.serial("inside a real group", () => {
		let expenseId = "";
		let settlementId = "";

		test("a transactional key does day-to-day work in the group", async () => {
			const key = { "x-api-key": keyNamed("transactional").secret };
			const ok = async (method: Method, path: string, data?: unknown) => {
				const response = await bare.fetch(path, {
					method,
					headers: { ...key, origin: BASE },
					...(data === undefined ? {} : { data }),
					failOnStatusCode: false,
				});
				expect(
					response.status(),
					`${method} ${path}: ${await response.text()}`,
				).toBe(200);
				return json(response);
			};

			const groups = await ok("GET", "/api/v1/groups");
			expect(groups.map((group: { id: string }) => group.id)).toContain(GROUP);
			await ok("GET", `/api/v1/groups/${GROUP}`);
			await ok("GET", `/api/v1/groups/${GROUP}/members`);
			await ok("GET", `/api/v2/groups/${GROUP}/expenses?limit=5`);
			await ok("GET", `/api/v1/groups/${GROUP}/balances`);
			await ok("GET", `/api/v1/groups/${GROUP}/activity?limit=5`);

			const expense = await ok("POST", `/api/v1/groups/${GROUP}/expenses`, {
				description: "Key-scoped dinner",
				amountMinor: 1000,
				currency: "INR",
				paidByUserId: "B",
				splitMethod: "even",
				date: new Date().toISOString(),
				participants: [
					{ userId: "A", input: null },
					{ userId: "B", input: null },
				],
			});
			expenseId = expense.id;
			expect(expenseId).toBeTruthy();
			await ok("GET", `/api/v1/expenses/${expenseId}`);
			await ok("PATCH", `/api/v1/expenses/${expenseId}`, {
				description: "Key-scoped dinner (edited)",
				amountMinor: 1000,
				currency: "INR",
				paidByUserId: "B",
				splitMethod: "even",
				date: new Date().toISOString(),
				participants: [
					{ userId: "A", input: null },
					{ userId: "B", input: null },
				],
			});

			const settlement = await ok(
				"POST",
				`/api/v1/groups/${GROUP}/settlements`,
				{ toUserId: "B", amountMinor: 500, currency: "INR", note: "via key" },
			);
			settlementId = settlement.id;
			expect(settlementId).toBeTruthy();
		});

		test("the same key can't delete or restructure the group", async () => {
			const key = { "x-api-key": keyNamed("transactional").secret };
			for (const [method, path, data] of [
				["DELETE", `/api/v1/expenses/${expenseId}`],
				["DELETE", `/api/v1/settlements/${settlementId}`],
				["DELETE", `/api/v1/groups/${GROUP}`],
				["PATCH", `/api/v1/groups/${GROUP}`, { name: "Renamed by key" }],
				["POST", `/api/v1/groups/${GROUP}/members`, { name: "Intruder" }],
				[
					"POST",
					`/api/v1/groups/${GROUP}/invitations`,
					{ email: "x@example.com", role: "member" },
				],
				["DELETE", `/api/v1/groups/${GROUP}/members/B`],
				["POST", "/api/v1/groups", { name: "Key group" }],
			] as [Method, string, unknown?][]) {
				const response = await bare.fetch(path, {
					method,
					headers: { ...key, origin: BASE },
					...(data === undefined ? {} : { data }),
					failOnStatusCode: false,
				});
				expect(response.status(), `${method} ${path}`).toBe(403);
				expect((await response.json()).error.message).toMatch(
					/^API key lacks /,
				);
			}
			const group = await (await session.get(`/api/v1/groups/${GROUP}`)).json();
			expect(group.name).toBe(GROUP);
		});

		test("a management key creates, staffs and deletes a group", async () => {
			const key = { "x-api-key": keyNamed("management").secret };
			const ok = async (method: Method, path: string, data?: unknown) => {
				const response = await bare.fetch(path, {
					method,
					headers: { ...key, origin: BASE },
					...(data === undefined ? {} : { data }),
					failOnStatusCode: false,
				});
				expect(
					response.status(),
					`${method} ${path}: ${await response.text()}`,
				).toBe(200);
				return json(response);
			};
			const group = await ok("POST", "/api/v1/groups", {
				name: "Made by a key",
			});
			await ok("POST", `/api/v1/groups/${group.id}/members`, {
				name: "Guest via key",
			});
			await ok("PATCH", `/api/v1/groups/${group.id}`, {
				name: "Renamed by a key",
			});
			const members = await ok("GET", `/api/v1/groups/${group.id}/members`);
			expect(members.length).toBe(2);
			await ok("DELETE", `/api/v1/groups/${group.id}`);

			// Clean up the transactional key's work in the seeded group.
			await ok("DELETE", `/api/v1/settlements/${settlementId}`);
			await ok("DELETE", `/api/v1/expenses/${expenseId}`);
		});
	});
