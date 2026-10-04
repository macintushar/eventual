import { getLogger, type LogRecord, type Sink } from "@logtape/logtape";

export function getAppLogger(...category: string[]) {
	return getLogger(["eventual", ...category]);
}

const sensitiveKey =
	/password|secret|token|authorization|cookie|email|address|payload|body|input|result|query|search|amount|balance|description|name|url|path|key$/i;

/** Keep arbitrary SDK properties and exception messages out of both outputs. */
export function sanitizeLogValue(
	value: unknown,
	seen = new WeakSet<object>(),
	depth = 0,
): unknown {
	if (value instanceof Error) {
		const error = new Error("Application failure");
		error.name = value.name;
		// Preserve stack frames for grouping without retaining the original message.
		error.stack = `${error.name}: ${error.message}\n${
			value.stack
				?.split("\n")
				.filter((line) => /^\s+at /.test(line))
				.join("\n") ?? ""
		}`;
		return error;
	}
	if (value === null || typeof value !== "object") return value;
	if (depth > 8 || seen.has(value)) return "[REDACTED]";
	seen.add(value);
	if (Array.isArray(value))
		return value.map((item) => sanitizeLogValue(item, seen, depth + 1));
	return Object.fromEntries(
		Object.entries(value)
			.filter(([, item]) => item !== undefined)
			.map(([key, item]) => [
				key,
				sensitiveKey.test(key)
					? "[REDACTED]"
					: sanitizeLogValue(item, seen, depth + 1),
			]),
	);
}

export function sanitizeLogRecord(record: LogRecord): LogRecord {
	return {
		...record,
		properties: sanitizeLogValue(record.properties) as Record<string, unknown>,
		// Application messages are static templates; redact interpolated values too.
		message: record.message.map((part, index) =>
			index % 2 === 1 ? "[REDACTED]" : part,
		),
	};
}

export function withLogRedaction(sink: Sink): Sink {
	return (record) => sink(sanitizeLogRecord(record));
}

/** SSR dispatches internally, so a missing header must not shadow async context. */
export function responseRequestContext(
	response: Pick<Response, "headers">,
): Record<string, string> {
	const requestId = response.headers.get("X-Request-Id");
	return requestId ? { requestId } : {};
}
