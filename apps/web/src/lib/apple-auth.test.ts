import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { test } from "node:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { verifyProviderIdToken } from "better-auth/oauth2";
import { apple } from "better-auth/social-providers";
import { createAppleProvider } from "#/lib/apple-auth";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
	namedCurve: "prime256v1",
});
const config = {
	clientId: "app.eventual.web",
	teamId: "TEAM123456",
	keyId: "KEY1234567",
	privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
	appBundleIdentifier: "app.eventual.mobile",
};
const noUser = async () => undefined;

function encode(part: object) {
	return Buffer.from(JSON.stringify(part)).toString("base64url");
}

function profileToken(claims: object) {
	return `${encode({ alg: "RS256" })}.${encode({ sub: "apple-subject", ...claims })}.unused`;
}

test("Apple stays disabled unless all credentials and the native audience exist", () => {
	assert.equal(createAppleProvider({}, noUser), undefined);
	for (const key of Object.keys(config)) {
		assert.equal(
			createAppleProvider({ ...config, [key]: undefined }, noUser),
			undefined,
		);
	}
});

test("Apple client secret has ES256 claims and a 180-day expiry", () => {
	const before = Math.floor(Date.now() / 1000);
	const provider = createAppleProvider(
		{ ...config, privateKey: config.privateKey.replace(/\n/g, "\\n") },
		noUser,
	);
	assert.ok(provider?.clientSecret);
	const [header, payload, signature] = provider.clientSecret.split(".");
	assert.ok(header && payload && signature);
	assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), {
		alg: "ES256",
		kid: config.keyId,
	});
	const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
	assert.equal(claims.iss, config.teamId);
	assert.equal(claims.sub, config.clientId);
	assert.equal(claims.aud, "https://appleid.apple.com");
	assert.ok(
		claims.iat >= before && claims.iat <= Math.floor(Date.now() / 1000),
	);
	assert.equal(claims.exp - claims.iat, 180 * 24 * 60 * 60);
	assert.ok(claims.exp - claims.iat <= 15_777_000);
	assert.equal(Buffer.from(signature, "base64url").length, 64);
	assert.ok(
		verify(
			"sha256",
			Buffer.from(`${header}.${payload}`),
			{ key: publicKey, dsaEncoding: "ieee-p1363" },
			Buffer.from(signature, "base64url"),
		),
	);
	assert.equal(provider.appBundleIdentifier, config.appBundleIdentifier);
});

test("Apple names use first-sign-in details, then the email local part", async () => {
	const options = createAppleProvider(config, noUser);
	assert.ok(options);
	const provider = apple(options);
	const token = profileToken({ email: "alice@privaterelay.appleid.com" });
	assert.equal(
		(await provider.getUserInfo({ idToken: token }))?.user.name,
		"alice",
	);
	assert.equal(
		(
			await provider.getUserInfo({
				idToken: token,
				user: { name: { firstName: "Alice", lastName: "Example" } },
			})
		)?.user.name,
		"Alice Example",
	);
	assert.equal(
		(
			await provider.getUserInfo({
				idToken: profileToken({
					email: "alice@example.com",
					name: "  Alice  ",
				}),
			})
		)?.user.name,
		"Alice",
	);
	assert.equal(
		(await provider.getUserInfo({ idToken: profileToken({}) }))?.user.name,
		"Apple user",
	);
});

test("later Apple tokens reuse only the already-linked subject's details", async () => {
	const options = createAppleProvider(config, async (subject) => {
		assert.equal(subject, "apple-subject");
		return {
			name: "Saved name",
			email: "saved@example.com",
			emailVerified: true,
		};
	});
	assert.ok(options);
	const provider = apple(options);
	const saved = await provider.getUserInfo({ idToken: profileToken({}) });
	assert.equal(saved?.user.name, "Saved name");
	assert.equal(saved?.user.email, "saved@example.com");
	assert.equal(saved?.user.emailVerified, true);
	const fresh = await provider.getUserInfo({
		idToken: profileToken({
			email: "fresh@example.com",
			email_verified: "true",
		}),
	});
	assert.equal(fresh?.user.name, "fresh");
	assert.equal(fresh?.user.email, "fresh@example.com");
	assert.equal(fresh?.user.emailVerified, true);
	const unknown = createAppleProvider(config, noUser);
	assert.ok(unknown);
	assert.equal(
		(await apple(unknown).getUserInfo({ idToken: profileToken({}) }))?.user
			.email,
		undefined,
	);
});

test("Better Auth verifies native Apple tokens without a nonce and rejects bad claims", async (t) => {
	const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
	const jwk = {
		...keys.publicKey.export({ format: "jwk" }),
		alg: "RS256",
		kid: "apple-key",
	};
	t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
		assert.equal(String(url), "https://appleid.apple.com/auth/keys");
		return Response.json({ keys: [jwk] });
	});
	const now = Math.floor(Date.now() / 1000);
	function token(overrides: object = {}) {
		const unsigned = `${encode({ alg: "RS256", kid: jwk.kid })}.${encode({
			iss: "https://appleid.apple.com",
			aud: config.appBundleIdentifier,
			sub: "apple-subject",
			iat: now,
			exp: now + 300,
			...overrides,
		})}`;
		return `${unsigned}.${sign("sha256", Buffer.from(unsigned), keys.privateKey).toString("base64url")}`;
	}
	const database = {
		user: [] as {
			id: string;
			name: string;
			email: string;
			emailVerified: boolean;
		}[],
		account: [] as {
			providerId: string;
			accountId: string;
			userId: string;
		}[],
		session: [],
		verification: [],
	};
	const options = createAppleProvider(config, async (subject) => {
		const account = database.account.find(
			(row) => row.providerId === "apple" && row.accountId === subject,
		);
		return database.user.find((row) => row.id === account?.userId);
	});
	assert.ok(options);
	const provider = apple(options);
	assert.equal(await verifyProviderIdToken(provider, token()), true);
	assert.equal(
		await verifyProviderIdToken(provider, token({ aud: config.clientId })),
		true,
	);
	for (const claims of [
		{ aud: "another.app" },
		{ iss: "https://elsewhere.example" },
		{ exp: now - 1 },
		{ iat: now - 7200 },
	]) {
		assert.equal(await verifyProviderIdToken(provider, token(claims)), false);
	}
	assert.equal(
		await verifyProviderIdToken(provider, `${token()}tampered`),
		false,
	);
	assert.equal(
		await verifyProviderIdToken(provider, token(), "expected-nonce"),
		false,
	);

	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		secret: "apple-test-secret-at-least-thirty-two-characters",
		database: memoryAdapter(database),
		trustedOrigins: ["eventual://", "https://appleid.apple.com"],
		socialProviders: { apple: options },
	});
	const signIn = (claims: object) =>
		auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/social", {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: "eventual://" },
				body: JSON.stringify({
					provider: "apple",
					idToken: { token: token(claims) },
				}),
			}),
		);
	const first = await signIn({
		email: "alice@example.com",
		email_verified: "true",
	});
	assert.equal(first.status, 200);
	assert.ok(
		first.headers.get("set-cookie")?.includes("better-auth.session_token"),
	);
	assert.equal(database.user[0]?.name, "alice");
	assert.equal(database.account[0]?.accountId, "apple-subject");
	assert.equal((await signIn({})).status, 200);
	assert.equal(database.user.length, 1);
	assert.equal(database.account.length, 1);
	assert.equal((await signIn({ sub: "unknown-subject" })).status, 401);
	assert.equal((await signIn({ aud: "another.app" })).status, 401);
});
