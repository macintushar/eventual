import type { Endpoint } from "@eventual/schemas/contract";

export type BuiltRequest = {
	method: Endpoint["method"];
	/** Under the API root, with path parameters filled in and the query appended. */
	path: string;
	/** JSON body, or undefined when the input travels in the query string. */
	body: Record<string, unknown> | undefined;
};

function queryValue(value: unknown) {
	return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Turns an endpoint and its input into a request the server understands.
 * Fields named in the path fill it; the rest go in the query string for GET
 * (and endpoints that ask for it) or the JSON body otherwise. Arrays repeat
 * the query key, and `null`/`undefined` fields are left out of the query.
 */
export function buildRequest(
	endpoint: Pick<Endpoint, "method" | "path"> & { inputIn?: "query" },
	input: Record<string, unknown> = {},
): BuiltRequest {
	const used = new Set<string>();
	const pathname = endpoint.path.replace(
		/:([A-Za-z0-9_]+)/g,
		(_match, key: string) => {
			const value = input[key];
			if (value === undefined || value === null || value === "")
				throw new TypeError(`Missing path parameter "${key}"`);
			used.add(key);
			return encodeURIComponent(String(value));
		},
	);
	const rest = Object.fromEntries(
		Object.entries(input).filter(([key]) => !used.has(key)),
	);
	if (endpoint.method !== "GET" && endpoint.inputIn !== "query")
		return { method: endpoint.method, path: pathname, body: rest };
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(rest)) {
		if (value === undefined || value === null) continue;
		for (const item of Array.isArray(value) ? value : [value])
			query.append(key, queryValue(item));
	}
	const search = query.toString();
	return {
		method: endpoint.method,
		path: search ? `${pathname}?${search}` : pathname,
		body: undefined,
	};
}
