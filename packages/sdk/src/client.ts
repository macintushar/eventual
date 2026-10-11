import {
	type Endpoint,
	type EndpointFor,
	type EndpointInput,
	type EndpointName,
	type EndpointOutput,
	endpoints,
} from "@eventual/schemas/contract";
import { EventualApiError } from "./errors";
import { buildRequest } from "./request";

type HeadersSource =
	| HeadersInit
	| (() => HeadersInit | undefined | Promise<HeadersInit | undefined>);

export type EventualClientOptions = {
	/** The Eventual origin, e.g. `https://eventual.macintushar.xyz`. `/api` is added. */
	baseUrl: string;
	/** An Eventual API key, sent as a bearer token. */
	apiKey?: string;
	/**
	 * Extra headers for every request, or a function that returns them. A
	 * native app passes its stored session cookie here.
	 */
	headers?: HeadersSource;
	/** Defaults to the global `fetch`. */
	fetch?: typeof fetch;
	/** Browser only: `include` sends the session cookie cross-origin. */
	credentials?: RequestCredentials;
	/**
	 * Parse every JSON response with its output schema. Off by default: the
	 * server is already held to the contract, and parsing costs time on large
	 * pages. Useful in development and tests.
	 */
	validateResponses?: boolean;
};

export type RequestOptions = {
	signal?: AbortSignal;
	/**
	 * Makes a retried mutation safe: the server replays the first response for
	 * the same key and input instead of running it twice.
	 */
	idempotencyKey?: string;
	headers?: HeadersInit;
};

/** File endpoints (expense reports) resolve to the downloaded file. */
export type EndpointResult<Name extends EndpointName> =
	EndpointFor<Name> extends { responseType: "file" }
		? Blob
		: EndpointOutput<Name>;

/** Endpoints with nothing required in their input can be called without one. */
type CallArgs<Name extends EndpointName> =
	Record<string, never> extends EndpointInput<Name>
		? [input?: EndpointInput<Name>, options?: RequestOptions]
		: [input: EndpointInput<Name>, options?: RequestOptions];

const endpointByName = new Map<string, Endpoint>(
	endpoints.map((endpoint) => [endpoint.name, endpoint]),
);

export function getEndpoint<Name extends EndpointName>(name: Name) {
	const endpoint = endpointByName.get(name);
	if (!endpoint) throw new TypeError(`Unknown Eventual endpoint "${name}"`);
	return endpoint as EndpointFor<Name>;
}

async function resolveHeaders(source: HeadersSource | undefined) {
	return typeof source === "function" ? await source() : source;
}

export function createEventualClient(options: EventualClientOptions) {
	const apiRoot = `${options.baseUrl.replace(/\/+$/, "")}/api`;
	const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);

	async function call<Name extends EndpointName>(
		name: Name,
		...[input, request = {}]: CallArgs<Name>
	): Promise<EndpointResult<Name>> {
		const endpoint = getEndpoint(name);
		const built = buildRequest(
			endpoint,
			(input ?? {}) as Record<string, unknown>,
		);
		const headers = new Headers(await resolveHeaders(options.headers));
		headers.set("Accept", "application/json");
		if (options.apiKey)
			headers.set("Authorization", `Bearer ${options.apiKey}`);
		if (request.idempotencyKey)
			headers.set("Idempotency-Key", request.idempotencyKey);
		if (built.body !== undefined)
			headers.set("Content-Type", "application/json");
		for (const [key, value] of new Headers(request.headers))
			headers.set(key, value);

		const response = await fetcher(`${apiRoot}${built.path}`, {
			method: built.method,
			headers,
			body: built.body === undefined ? undefined : JSON.stringify(built.body),
			credentials: options.credentials,
			signal: request.signal,
		});
		if (!response.ok) {
			const body = await response.json().catch(() => undefined);
			throw new EventualApiError(response.status, body?.error);
		}
		if ("responseType" in endpoint && endpoint.responseType === "file")
			return (await response.blob()) as EndpointResult<Name>;
		const result: unknown = await response.json();
		return (
			options.validateResponses ? endpoint.output.parse(result) : result
		) as EndpointResult<Name>;
	}

	return { call };
}

export type EventualClient = ReturnType<typeof createEventualClient>;
