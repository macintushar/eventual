import assert from "node:assert/strict";
import { test } from "node:test";

import { dispatchApi } from "#/server/http";
import { openApiDocument } from "#/server/openapi";

function request(path: string, options?: RequestInit) {
	return new Request(`http://localhost:3000/api/${path}`, options);
}

test("public v1 endpoints and private cache headers", async () => {
	const health = await dispatchApi(request("v1/health"), "v1/health");
	assert.equal(health.status, 200);
	assert.deepEqual(await health.json(), { status: "ok" });
	assert.equal(health.headers.get("cache-control"), "private, no-store");

	const site = await dispatchApi(request("v1/site"), "v1/site");
	assert.equal(site.status, 200);
	assert.equal(site.headers.get("cache-control"), "private, max-age=5");
	assert.match(site.headers.get("vary") ?? "", /Cookie/);
});

test("web aggregates require a session cookie", async () => {
	const response = await dispatchApi(
		request("v1/app/dashboard", { headers: { "x-api-key": "invalid" } }),
		"v1/app/dashboard",
	);
	assert.equal(response.status, 403);
	assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("cookie-authenticated writes reject a foreign origin", async () => {
	const response = await dispatchApi(
		request("v1/me/profile", {
			method: "PATCH",
			headers: {
				origin: "https://elsewhere.example",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name: "Changed" }),
		}),
		"v1/me/profile",
	);
	assert.equal(response.status, 403);
});

test("malformed JSON is a validation error", async () => {
	const response = await dispatchApi(
		request("v1/groups", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		}),
		"v1/groups",
	);
	assert.equal(response.status, 422);
});

test("OpenAPI includes the UI REST endpoints", () => {
	const paths = openApiDocument().paths;
	assert.ok(paths["/v1/app/dashboard"]?.get);
	assert.ok(paths["/v1/me/profile"]?.patch);
	assert.ok(paths["/v1/me/api-keys/{keyId}"]?.delete);
});
