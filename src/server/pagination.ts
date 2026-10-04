import { createHash } from "node:crypto";
import { AppError } from "#/server/errors";

/** Opaque continuation, bound to the normalized query, never an authorization grant. */
export function cursorScope(values: unknown[]) {
	return createHash("sha256")
		.update(JSON.stringify(values))
		.digest("base64url");
}

export function encodePageCursor(scope: string, values: (string | number)[]) {
	return Buffer.from(JSON.stringify({ v: 1, scope, values })).toString(
		"base64url",
	);
}

export function decodePageCursor(
	cursor: string,
	scope: string,
	types: ("string" | "number")[],
) {
	try {
		if (cursor.length > 2000 || !/^[\w-]+$/.test(cursor)) throw new Error();
		const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
		if (
			value.v !== 1 ||
			value.scope !== scope ||
			!Array.isArray(value.values) ||
			value.values.length !== types.length
		)
			throw new Error();
		for (const [i, type] of types.entries()) {
			const item = value.values[i];
			if (
				typeof item !== type ||
				(type === "number" && !Number.isSafeInteger(item))
			)
				throw new Error();
		}
		return value.values as (string | number)[];
	} catch {
		throw new AppError("VALIDATION", "Invalid cursor for this query");
	}
}

export function pageLimit(limit = 30) {
	if (!Number.isInteger(limit) || limit < 1 || limit > 100)
		throw new AppError("VALIDATION", "Limit must be between 1 and 100");
	return limit;
}
