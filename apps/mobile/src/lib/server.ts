import { createEventualClient, type EndpointOutput } from "@eventual/sdk";
import * as SecureStore from "expo-secure-store";

export const HOSTED_ORIGIN = "https://eventual.macintushar.xyz";
/** The oldest server this build works with; see `nativeAppVersion` on /v1/site. */
export const MIN_NATIVE_APP_VERSION = 1;

export type SiteInfo = EndpointOutput<"site.get">;
export type Server = { origin: string; site: SiteInfo };

const STORE_KEY = "eventual_server";
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "10.0.2.2"];

/**
 * The origin for an address someone typed, or null if it isn't one. A bare
 * host gets `https://`. Plain HTTP is only allowed for local addresses in
 * development builds.
 */
export function parseServerAddress(input: string) {
	const trimmed = input.trim();
	if (!trimmed) return null;
	try {
		const parsed = new URL(
			/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
		);
		if (
			parsed.username ||
			parsed.password ||
			parsed.search ||
			parsed.hash ||
			parsed.pathname.replace(/\/+$/, "") !== ""
		)
			return null;
		if (parsed.protocol === "https:") return parsed.origin;
		if (
			__DEV__ &&
			parsed.protocol === "http:" &&
			LOCAL_HOSTS.includes(parsed.hostname)
		)
			return parsed.origin;
		return null;
	} catch {
		return null;
	}
}

export type ProbeFailure = "unreachable" | "not-eventual" | "outdated";
export type ProbeResult =
	| { ok: true; server: Server }
	| { ok: false; reason: ProbeFailure };

/** Checks that `origin` is an Eventual server this build can talk to. */
export async function probeServer(
	origin: string,
	signal?: AbortSignal,
): Promise<ProbeResult> {
	// Unvalidated: a server from before the app lacks `nativeAppVersion`, and
	// that should read as "outdated", not "not Eventual".
	const client = createEventualClient({ baseUrl: origin, credentials: "omit" });
	try {
		await client.call("health", {}, { signal });
	} catch (error) {
		if (signal?.aborted) throw error;
		// A response that isn't the health payload means something answered,
		// just not Eventual.
		return {
			ok: false,
			reason:
				error instanceof TypeError && /network/i.test(error.message)
					? "unreachable"
					: "not-eventual",
		};
	}
	let site: Partial<SiteInfo>;
	try {
		site = await client.call("site.get", {}, { signal });
	} catch (error) {
		if (signal?.aborted) throw error;
		return { ok: false, reason: "not-eventual" };
	}
	if (typeof site.googleSignIn !== "boolean")
		return { ok: false, reason: "not-eventual" };
	if ((site.nativeAppVersion ?? 0) < MIN_NATIVE_APP_VERSION)
		return { ok: false, reason: "outdated" };
	return { ok: true, server: { origin, site: site as SiteInfo } };
}

export const probeMessages: Record<ProbeFailure, string> = {
	unreachable:
		"Couldn’t reach this server. Check the address and your connection, then try again.",
	"not-eventual": "This address answered, but it isn’t an Eventual server.",
	outdated:
		"This Eventual server is too old for the app. Ask whoever runs it to update, or use the web app.",
};

/** One line for a server row. */
export const probeSummaries: Record<ProbeFailure, string> = {
	unreachable: "Couldn’t reach this server",
	"not-eventual": "Not an Eventual server",
	outdated: "Needs an update to work with the app",
};

export async function loadSavedServer(): Promise<Server | null> {
	const raw = await SecureStore.getItemAsync(STORE_KEY);
	if (!raw) return null;
	try {
		const saved = JSON.parse(raw) as Server;
		return typeof saved.origin === "string" && saved.site ? saved : null;
	} catch {
		return null;
	}
}

export function saveServer(server: Server) {
	return SecureStore.setItemAsync(STORE_KEY, JSON.stringify(server));
}

/** Short form for display: the host, without `https://`. */
export function serverLabel(origin: string) {
	const url = new URL(origin);
	return url.protocol === "https:" ? url.host : origin;
}
