import { createHash, sign } from "node:crypto";
import { connect } from "node:http2";
import type { PushData } from "@eventual/schemas/push";
import { env } from "#/env";
import { type PushConfig, pushPlatforms } from "./push-config";

export type PushMessage = { body: string; data: PushData };
type ProviderResponse = { status: number; body: unknown; retryAfter?: string };
type ProviderRequest = {
	url: string;
	headers: Record<string, string>;
	body: string;
};
export type PushTransport = {
	apns: (request: ProviderRequest) => Promise<ProviderResponse>;
	http: (request: ProviderRequest) => Promise<ProviderResponse>;
};
export type PushSender = (
	device: { platform: "ios" | "android"; token: string },
	message: PushMessage,
) => Promise<"sent" | "invalid" | "unavailable">;

function parseBody(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export const nativePushTransport: PushTransport = {
	async http(request) {
		const response = await fetch(request.url, {
			method: "POST",
			headers: request.headers,
			body: request.body,
			signal: AbortSignal.timeout(15_000),
		});
		return {
			status: response.status,
			body: parseBody(await response.text()),
			retryAfter: response.headers.get("retry-after") ?? undefined,
		};
	},
	apns(request) {
		return new Promise((resolve, reject) => {
			const url = new URL(request.url);
			const client = connect(url.origin);
			const fail = () => {
				client.destroy();
				reject(new Error("APNs transport failed"));
			};
			client.on("error", fail);
			client.setTimeout(15_000, fail);
			const stream = client.request({
				":method": "POST",
				":path": url.pathname,
				...request.headers,
			});
			let status = 0;
			let retryAfter: string | undefined;
			let body = "";
			stream.on("response", (headers) => {
				status = Number(headers[":status"]);
				retryAfter = headers["retry-after"]?.toString();
			});
			stream.setEncoding("utf8");
			stream.on("data", (chunk: string) => {
				body += chunk;
			});
			stream.on("error", fail);
			stream.on("end", () => {
				client.close();
				resolve({ status, body: parseBody(body), retryAfter });
			});
			stream.end(request.body);
		});
	},
};

function jwt(
	header: object,
	claims: object,
	key: string,
	algorithm: "ES256" | "RS256",
) {
	const unsigned = [header, claims]
		.map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
		.join(".");
	const signature = sign("sha256", Buffer.from(unsigned), {
		key: key.replace(/\\n/g, "\n"),
		...(algorithm === "ES256" ? { dsaEncoding: "ieee-p1363" as const } : {}),
	});
	return `${unsigned}.${signature.toString("base64url")}`;
}

/** A stable bounded per-group key, scoped to account and server. */
export function pushThread(data: PushData) {
	return createHash("sha256")
		.update(`${data.origin}:${data.userId}:${data.groupId}`)
		.digest("hex");
}

export function apnsPayload(message: PushMessage) {
	return {
		aps: {
			alert: { title: "Eventual", body: message.body },
			sound: "default",
			"thread-id": pushThread(message.data),
		},
		...message.data,
	};
}

export function fcmPayload(token: string, message: PushMessage) {
	return {
		message: {
			token,
			notification: { title: "Eventual", body: message.body },
			data: message.data,
			android: {
				collapse_key: pushThread(message.data),
				notification: {
					tag: pushThread(message.data),
					channel_id: "eventual-activity",
				},
			},
		},
	};
}

export class PushDeliveryError extends Error {
	readonly retryAt?: Date;
	constructor(provider: string, status: number, retryAfter?: string) {
		// Never persist provider bodies, registration tokens or credentials in job errors.
		super(`${provider} push failed (${status})`);
		if (retryAfter) {
			const seconds = Number(retryAfter);
			const time = Number.isFinite(seconds)
				? Date.now() + seconds * 1000
				: Date.parse(retryAfter);
			if (Number.isFinite(time)) this.retryAt = new Date(time);
		}
	}
}

export function createPushSender(
	config: PushConfig,
	transport: PushTransport = nativePushTransport,
): PushSender {
	let apnsAuth: { token: string; expires: number } | undefined;
	let fcmAuth: { token: string; expires: number } | undefined;
	return async (device, message) => {
		if (!pushPlatforms(config)[device.platform]) return "unavailable";
		const now = Math.floor(Date.now() / 1000);
		if (device.platform === "ios") {
			if (!apnsAuth || apnsAuth.expires <= now)
				apnsAuth = {
					token: jwt(
						{ alg: "ES256", kid: config.APNS_KEY_ID },
						{ iss: config.APNS_TEAM_ID, iat: now },
						config.APNS_PRIVATE_KEY ?? "",
						"ES256",
					),
					expires: now + 50 * 60,
				};
			const host =
				config.APNS_ENVIRONMENT === "sandbox"
					? "api.sandbox.push.apple.com"
					: "api.push.apple.com";
			const response = await transport.apns({
				url: `https://${host}/3/device/${encodeURIComponent(device.token)}`,
				headers: {
					authorization: `bearer ${apnsAuth.token}`,
					"apns-topic": config.APNS_BUNDLE_ID ?? "",
					"apns-push-type": "alert",
					"apns-priority": "10",
					"apns-collapse-id": pushThread(message.data),
					"content-type": "application/json",
				},
				body: JSON.stringify(apnsPayload(message)),
			});
			if (response.status === 200) return "sent";
			const reason = (response.body as { reason?: string } | null)?.reason;
			if (
				response.status === 410 ||
				reason === "BadDeviceToken" ||
				reason === "Unregistered"
			)
				return "invalid";
			if (reason === "ExpiredProviderToken") apnsAuth = undefined;
			throw new PushDeliveryError("APNs", response.status, response.retryAfter);
		}
		if (!fcmAuth || fcmAuth.expires <= now) {
			let account: { client_email: string; private_key: string };
			try {
				account = JSON.parse(config.FCM_SERVICE_ACCOUNT ?? "{}");
				if (!account.client_email || !account.private_key) throw new Error();
			} catch {
				throw new Error("Invalid FCM service account configuration");
			}
			const assertion = jwt(
				{ alg: "RS256", typ: "JWT" },
				{
					iss: account.client_email,
					scope: "https://www.googleapis.com/auth/firebase.messaging",
					aud: "https://oauth2.googleapis.com/token",
					iat: now,
					exp: now + 3600,
				},
				account.private_key,
				"RS256",
			);
			const response = await transport.http({
				url: "https://oauth2.googleapis.com/token",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
					assertion,
				}).toString(),
			});
			const body = response.body as {
				access_token?: string;
				expires_in?: number;
			} | null;
			if (response.status !== 200 || !body?.access_token)
				throw new PushDeliveryError(
					"FCM authorization",
					response.status,
					response.retryAfter,
				);
			fcmAuth = {
				token: body.access_token,
				expires: now + (body.expires_in ?? 3600) - 60,
			};
		}
		const response = await transport.http({
			url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.FCM_PROJECT_ID ?? "")}/messages:send`,
			headers: {
				authorization: `Bearer ${fcmAuth.token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(fcmPayload(device.token, message)),
		});
		if (response.status >= 200 && response.status < 300) return "sent";
		const error = (
			response.body as {
				error?: {
					status?: string;
					details?: { "@type"?: string; errorCode?: string }[];
				};
			} | null
		)?.error;
		if (
			error?.status === "UNREGISTERED" ||
			error?.details?.some(
				(detail) =>
					detail["@type"] ===
						"type.googleapis.com/google.firebase.fcm.v1.FcmError" &&
					detail.errorCode === "UNREGISTERED",
			)
		)
			return "invalid";
		if (response.status === 401) fcmAuth = undefined;
		throw new PushDeliveryError("FCM", response.status, response.retryAfter);
	};
}

export const sendPush = createPushSender(env);
