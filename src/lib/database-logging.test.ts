import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import {
	configureSync,
	type LogRecord,
	resetSync,
	withContext,
} from "@logtape/logtape";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { withDatabaseLogging } from "./database-logging";

test("database timing covers Drizzle reads, batches, transactions and failures without logging SQL or values", async () => {
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
			{
				category: ["eventual", "database"],
				lowestLevel: "info",
				sinks: ["memory"],
			},
			{
				category: ["logtape", "meta"],
				lowestLevel: "fatal",
				sinks: ["memory"],
			},
		],
	});
	const client = withDatabaseLogging(createClient({ url: "file::memory:" }));
	const db = drizzle(client);
	try {
		await withContext({ requestId: "test-request" }, async () => {
			await db.run(sql`create table timing_test (value text)`);
			await db.run(
				sql`insert into timing_test values (${"private@example.com"})`,
			);
			assert.equal(
				(await db.all<{ value: string }>(sql`select value from timing_test`))[0]
					.value,
				"private@example.com",
			);
			await db.batch([
				db.run(sql`insert into timing_test values (${"batch-secret"})`),
				db.all(sql`select * from timing_test`),
			]);
			await db.transaction(async (tx) => {
				await tx.run(
					sql`insert into timing_test values (${"transaction-secret"})`,
				);
			});
			await assert.rejects(
				db.transaction(async (tx) => {
					await tx.run(
						sql`insert into timing_test values (${"rollback-secret"})`,
					);
					throw new Error("rollback");
				}),
				/rollback/,
			);
			await assert.rejects(
				client.execute("select * from nonexistent_private_table"),
			);
		});
		const methods = records.map((record) => record.properties.driverMethod);
		for (const method of [
			"execute",
			"batch",
			"transaction",
			"commit",
			"rollback",
		])
			assert.ok(methods.includes(method), method);
		for (const record of records) {
			assert.equal(record.properties.requestId, "test-request");
			assert.equal(typeof record.properties.durationMs, "number");
			assert.ok(Number(record.properties.durationMs) >= 0);
		}
		assert.ok(
			records.some(
				(record) =>
					record.properties.statementType === "INSERT" &&
					record.properties.parameterCount === 1,
			),
		);
		assert.ok(
			records.some(
				(record) =>
					record.properties.driverMethod === "batch" &&
					record.properties.statementCount === 2,
			),
		);
		assert.ok(
			records.some(
				(record) =>
					record.level === "warning" && record.properties.success === false,
			),
		);
		const output = JSON.stringify(records);
		for (const sensitive of [
			"private@example.com",
			"batch-secret",
			"transaction-secret",
			"rollback-secret",
			"nonexistent_private_table",
			"timing_test",
		])
			assert.ok(!output.includes(sensitive), sensitive);
		// The rolled-back statement must not alter the table; method receivers remain intact.
		assert.equal(
			(
				await db.all<{ total: number }>(
					sql`select count(*) as total from timing_test`,
				)
			)[0].total,
			3,
		);
	} finally {
		client.close();
		assert.equal(client.closed, true);
		resetSync();
	}
});
