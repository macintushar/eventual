import assert from "node:assert/strict";
import { test } from "node:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { lastLoginMethod } from "better-auth/plugins";
import { LAST_LOGIN_CONSENT_COOKIE } from "#/lib/last-login-consent";

const MARKER = "better-auth.last_used_login_method";

/**
 * Mirrors src/lib/auth.ts: the plugin only writes the marker where the
 * visitor already granted consent.
 */
function fixture() {
	const database = {
		user: [] as Record<string, unknown>[],
		account: [] as Record<string, unknown>[],
		session: [] as Record<string, unknown>[],
		verification: [] as Record<string, unknown>[],
	};
	const auth = betterAuth({
		appName: "Eventual",
		baseURL: "http://localhost:3000",
		secret: "last-login-secret-at-least-thirty-two-characters",
		database: memoryAdapter(database),
		emailAndPassword: { enabled: true },
		plugins: [
			lastLoginMethod({
				beforeStoreCookie: (ctx) =>
					(ctx.headers?.get("cookie") ?? "").includes(
						`${LAST_LOGIN_CONSENT_COOKIE}=granted`,
					),
			}),
		],
	});
	const request = (path: string, init?: RequestInit) =>
		auth.handler(
			new Request(`http://localhost:3000/api/auth/${path}`, {
				headers: { Origin: "http://localhost:3000" },
				...init,
			}),
		);
	const post = (path: string, body: object, cookie?: string) =>
		request(path, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:3000",
				...(cookie ? { cookie } : {}),
			},
			body: JSON.stringify(body),
		});
	return { database, request, post };
}

const markerOf = (response: Response) =>
	(response.headers.getSetCookie?.() ?? []).find((cookie) =>
		cookie.startsWith(`${MARKER}=`),
	);

async function signUp(f: ReturnType<typeof fixture>) {
	const email = "person@example.com";
	const response = await f.post("sign-up/email", {
		email,
		name: "Person",
		password: "Original123!",
	});
	assert.equal(response.status, 200);
	return email;
}

test("a granted visitor gets a marker cookie that scripts can read", async () => {
	const f = fixture();
	const email = await signUp(f);

	const marker = markerOf(
		await f.post(
			"sign-in/email",
			{ email, password: "Original123!" },
			`${LAST_LOGIN_CONSENT_COOKIE}=granted`,
		),
	);
	assert.match(marker as string, new RegExp(`^${MARKER}=email;`));
	// The login screen reads this from the browser, so it cannot be httpOnly.
	assert.doesNotMatch(marker as string, /httponly/i);
});

test("sign-in still succeeds when consent is withheld", async () => {
	const f = fixture();
	const email = await signUp(f);

	for (const cookie of [undefined, `${LAST_LOGIN_CONSENT_COOKIE}=denied`]) {
		const response = await f.post(
			"sign-in/email",
			{ email, password: "Original123!" },
			cookie,
		);
		assert.equal(response.status, 200, `cookie=${cookie}`);
		// The session cookie is still issued; only the hint is withheld.
		assert.ok(
			response.headers
				.getSetCookie()
				.some((cookie) => cookie.startsWith("better-auth.session_token=")),
			`cookie=${cookie}`,
		);
		assert.equal(markerOf(response), undefined, `cookie=${cookie}`);
	}
});

test("no marker cookie is written when the response carries no session", async () => {
	const f = fixture();
	assert.equal(markerOf(await f.request("get-session")), undefined);
});

test("the marker stays in the cookie, so the user table needs no new column", async () => {
	const f = fixture();
	const email = await signUp(f);
	await f.post(
		"sign-in/email",
		{ email, password: "Original123!" },
		`${LAST_LOGIN_CONSENT_COOKIE}=granted`,
	);
	assert.equal(f.database.user[0].lastLoginMethod, undefined);
});
