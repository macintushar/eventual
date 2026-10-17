import assert from "node:assert/strict";
import { test } from "node:test";
import { siteInfoSchema } from "@eventual/schemas/outputs";

import { env } from "#/env";
import { auth } from "#/lib/auth";
import { dispatchApi } from "#/server/http";
import { openApiDocument } from "#/server/openapi";
import { pushCapability } from "#/server/push-config";

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
	const siteBody = siteInfoSchema.parse(await site.json());
	assert.deepEqual(siteBody.push, pushCapability());
	assert.equal(siteBody.statusPageUrl, env.STATUS_PAGE_URL);
	assert.equal(
		siteBody.appleSignIn,
		Boolean(auth.options.socialProviders.apple),
	);
});

test("web aggregates verify a presented key before anything else", async () => {
	// Only full account access keys get past this point; scoped-key refusals
	// are covered end to end in tests/e2e/api-keys.spec.ts.
	const response = await dispatchApi(
		request("v1/app/dashboard", { headers: { "x-api-key": "invalid" } }),
		"v1/app/dashboard",
	);
	assert.equal(response.status, 401);
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
	assert.ok(paths["/v1/me/devices"]?.post);
	assert.ok(paths["/v1/me/devices"]?.get);
	assert.ok(paths["/v1/me/devices/{deviceId}"]?.delete);
	assert.ok(paths["/v1/me/push-preferences"]?.get);
	assert.ok(paths["/v1/me/push-preferences"]?.patch);
});

test("push routes require authentication and writes reject foreign origins", async () => {
	for (const [path, method] of [
		["v1/me/devices", "POST"],
		["v1/me/devices", "GET"],
		["v1/me/devices/id", "DELETE"],
		["v1/me/push-preferences", "GET"],
		["v1/me/push-preferences", "PATCH"],
	]) {
		const response = await dispatchApi(
			request(path, {
				method,
				headers: { "Content-Type": "application/json" },
				...(method === "POST" || method === "PATCH" ? { body: "{}" } : {}),
			}),
			path,
		);
		assert.equal(response.status, 401, `${method} ${path}`);
		assert.equal(response.headers.get("cache-control"), "private, no-store");
	}
	const path = "v1/me/devices";
	const response = await dispatchApi(
		request(path, {
			method: "POST",
			headers: {
				origin: "https://foreign.example",
				"Content-Type": "application/json",
			},
			body: "{}",
		}),
		path,
	);
	assert.equal(response.status, 403);
});
