import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
	configureSync,
	type LogRecord,
	resetSync,
	withConfigSync,
	withContext,
} from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";
import {
	getAppLogger,
	responseRequestContext,
	sanitizeLogValue,
	withLogRedaction,
} from "./logging";

beforeEach(() =>
	configureSync({
		reset: true,
		contextLocalStorage: new AsyncLocalStorage<Record<string, unknown>>(),
		sinks: { noop: () => {} },
		loggers: [
			{ category: ["logtape", "meta"], lowestLevel: "fatal", sinks: ["noop"] },
		],
	}),
);
afterEach(() => resetSync());

describe("logging privacy", () => {
	test("redacts nested secrets and financial data, including cyclic values", () => {
		const input: Record<string, unknown> = {
			operation: "expense.create",
			token: "secret",
			nested: { email: "person@example.com", amount: 100, status: 200 },
			items: [{ password: "secret" }],
		};
		input.circular = input;
		assert.deepEqual(sanitizeLogValue(input), {
			operation: "expense.create",
			token: "[REDACTED]",
			nested: { email: "[REDACTED]", amount: "[REDACTED]", status: 200 },
			items: [{ password: "[REDACTED]" }],
			circular: "[REDACTED]",
		});
	});
	test("keeps exception frames while removing messages and custom data", () => {
		const original = Object.assign(new TypeError("person@example.com secret"), {
			password: "secret",
		});
		const safe = sanitizeLogValue(original) as Error;
		assert.ok(safe instanceof Error);
		assert.equal(safe.name, "TypeError");
		assert.ok(safe.stack?.includes("logging.test.ts"));
		assert.ok(!safe.stack?.includes("person@example.com"));
		assert.ok(!("password" in safe));
	});
	test("redacts interpolated messages at the sink", () => {
		const records: LogRecord[] = [];
		withConfigSync(
			{
				sinks: {
					memory: withLogRedaction((record) => {
						records.push(record);
					}),
				},
				loggers: [
					{ category: ["eventual"], lowestLevel: "debug", sinks: ["memory"] },
				],
			},
			() => {
				getAppLogger("test").info("Action for {email}", {
					email: "private@example.com",
					operation: "group.create",
				});
			},
		);
		assert.ok(!JSON.stringify(records).includes("private@example.com"));
		assert.equal(records[0].properties.operation, "group.create");
	});
});

test("Sentry receives structured logs, breadcrumbs, correlated traces and one exception", () => {
	const logs: Array<Record<string, unknown>> = [];
	const breadcrumbs: unknown[] = [];
	const exceptions: unknown[] = [];
	const messages: unknown[] = [];
	const sentry = {
		captureMessage: (message: unknown) => {
			messages.push(message);
			return "message";
		},
		captureException: (error: unknown) => {
			exceptions.push(error);
			return "exception";
		},
		getActiveSpan: () => ({
			spanContext: () => ({ traceId: "trace", spanId: "span" }),
		}),
		getClient: () => ({ getOptions: () => ({ enableLogs: true }) }),
		getIsolationScope: () => ({
			addBreadcrumb: (breadcrumb: unknown) => {
				breadcrumbs.push(breadcrumb);
			},
		}),
		logger: {
			info: (_message: unknown, attributes: Record<string, unknown>) => {
				logs.push(attributes);
			},
			error: (_message: unknown, attributes: Record<string, unknown>) => {
				logs.push(attributes);
			},
		},
	};
	withConfigSync(
		{
			sinks: {
				sentry: withLogRedaction(getSentrySink({ sentry, breadcrumbs: true })),
			},
			loggers: [
				{ category: ["eventual"], lowestLevel: "info", sinks: ["sentry"] },
			],
		},
		() => {
			getAppLogger("test").info("Operation completed", {
				operation: "expense.create",
				password: "secret",
			});
			getAppLogger("test").error("Operation failed", {
				error: new Error("private@example.com"),
				requestId: "request",
			});
		},
	);
	assert.equal(logs.length, 2);
	assert.deepEqual(
		{
			category: logs[0].category,
			trace_id: logs[0].trace_id,
			span_id: logs[0].span_id,
			password: logs[0].password,
		},
		{
			category: "eventual.test",
			trace_id: "trace",
			span_id: "span",
			password: "[REDACTED]",
		},
	);
	assert.equal(breadcrumbs.length, 1);
	assert.equal(exceptions.length, 1);
	assert.equal(messages.length, 0);
	assert.equal((exceptions[0] as Error).message, "Application failure");
});

test("concurrent requests keep separate logging contexts", async () => {
	const records: LogRecord[] = [];
	configureSync({
		reset: true,
		contextLocalStorage: new AsyncLocalStorage<Record<string, unknown>>(),
		sinks: {
			memory: (record) => {
				records.push(record);
			},
		},
		loggers: [
			{ category: ["eventual"], lowestLevel: "info", sinks: ["memory"] },
			{
				category: ["logtape", "meta"],
				lowestLevel: "fatal",
				sinks: ["memory"],
			},
		],
	});
	try {
		await Promise.all(
			["one", "two"].map((requestId) =>
				withContext({ requestId }, async () => {
					await Promise.resolve();
					getAppLogger("test").info("Request completed", {
						expectedRequestId: requestId,
					});
				}),
			),
		);
		assert.equal(records.length, 2);
		for (const record of records)
			assert.equal(
				record.properties.requestId,
				record.properties.expectedRequestId,
			);
	} finally {
		resetSync();
	}
});

test("SSR response logs retain request context while browser responses use the header", () => {
	const records: LogRecord[] = [];
	withConfigSync(
		{
			sinks: {
				memory: withLogRedaction((record) => {
					records.push(record);
				}),
			},
			loggers: [
				{ category: ["eventual"], lowestLevel: "debug", sinks: ["memory"] },
			],
		},
		() => {
			withContext({ requestId: "outer-request" }, () => {
				const logger = getAppLogger("api-client").with({
					method: "GET",
					operation: "site.get",
				});
				logger.debug("API request started");
				logger.debug(
					"API response received",
					responseRequestContext(new Response()),
				);
				logger.debug(
					"API response received",
					responseRequestContext(
						new Response(null, {
							headers: { "X-Request-Id": "remote-request" },
						}),
					),
				);
			});
		},
	);
	assert.equal(records[0].properties.operation, "site.get");
	assert.equal(records[1].properties.requestId, "outer-request");
	assert.equal(records[2].properties.requestId, "remote-request");
});

test("undefined optional properties are omitted from log output", () => {
	assert.deepEqual(
		sanitizeLogValue({
			operation: undefined,
			status: 200,
			nested: { optional: undefined, success: true },
		}),
		{ status: 200, nested: { success: true } },
	);
});
