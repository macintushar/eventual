import { createPrivateKey, sign } from "node:crypto";
import type { AppleOptions } from "better-auth/social-providers";

type AppleConfig = {
	clientId?: string;
	teamId?: string;
	keyId?: string;
	privateKey?: string;
	appBundleIdentifier?: string;
};

type AppleUser = {
	name: string;
	email: string;
	emailVerified: boolean;
};

export function createAppleProvider(
	config: AppleConfig,
	findUser: (subject: string) => Promise<AppleUser | undefined>,
): AppleOptions | undefined {
	const { clientId, teamId, keyId, privateKey, appBundleIdentifier } = config;
	if (!clientId || !teamId || !keyId || !privateKey || !appBundleIdentifier)
		return undefined;

	const key = createPrivateKey(privateKey.replace(/\\n/g, "\n"));
	if (
		key.asymmetricKeyType !== "ec" ||
		key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
	)
		throw new Error("Apple sign-in requires a P-256 .p8 private key");
	const now = Math.floor(Date.now() / 1000);
	const header = { alg: "ES256", kid: keyId };
	const claims = {
		iss: teamId,
		sub: clientId,
		aud: "https://appleid.apple.com",
		iat: now,
		// Below Apple's six-month limit; a restart generates a fresh secret.
		exp: now + 180 * 24 * 60 * 60,
	};
	const unsigned = [header, claims]
		.map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
		.join(".");
	// JWT ECDSA signatures use fixed-width R || S, not ASN.1 DER.
	const signature = sign("sha256", Buffer.from(unsigned), {
		key,
		dsaEncoding: "ieee-p1363",
	}).toString("base64url");

	return {
		clientId,
		clientSecret: `${unsigned}.${signature}`,
		appBundleIdentifier,
		// Keep web tokens valid too: appBundleIdentifier alone replaces their audience.
		audience: [clientId, appBundleIdentifier],
		mapProfileToUser: async (profile) => {
			// Later Apple tokens may omit email; only reuse a linked account's details.
			const saved = profile.email ? undefined : await findUser(profile.sub);
			const email = profile.email ?? saved?.email;
			return {
				name:
					profile.name?.trim() ||
					saved?.name.trim() ||
					email?.split("@")[0] ||
					"Apple user",
				email,
				...(saved ? { emailVerified: saved.emailVerified } : {}),
			};
		},
	};
}
