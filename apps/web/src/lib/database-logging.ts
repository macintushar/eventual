import type { Client, Transaction } from "@libsql/client";
import { getAppLogger } from "#/lib/logging";

const timedMethods = new Set([
	"execute",
	"batch",
	"migrate",
	"executeMultiple",
	"transaction",
	"commit",
	"rollback",
]);

/** Measure driver round trips, including transaction statements and batches. */
export function withDatabaseLogging<T extends Client | Transaction>(
	client: T,
): T {
	return new Proxy(client, {
		get(target, property) {
			const value = Reflect.get(target, property, target);
			if (typeof value !== "function") return value;
			if (typeof property !== "string" || !timedMethods.has(property))
				return value.bind(target);
			return async (...args: unknown[]) => {
				const startedAt = performance.now();
				const logger = getAppLogger("database");
				const metadata = {
					driverMethod: property,
					...(property === "execute"
						? statementMetadata(args[0], args[1])
						: {}),
					...(Array.isArray(args[0]) ? { statementCount: args[0].length } : {}),
				};
				try {
					const result: unknown = await Reflect.apply(value, target, args);
					logger.info("Database execution completed", {
						...metadata,
						durationMs: elapsed(startedAt),
						success: true,
					});
					return property === "transaction"
						? withDatabaseLogging(result as Transaction)
						: result;
				} catch (error) {
					// The caller owns exception reporting; exclude driver messages and SQL.
					logger.warning("Database execution failed", {
						...metadata,
						durationMs: elapsed(startedAt),
						success: false,
					});
					throw error;
				}
			};
		},
	});
}

function elapsed(startedAt: number) {
	return Math.round((performance.now() - startedAt) * 100) / 100;
}

function statementMetadata(statement: unknown, positionalArgs: unknown) {
	const sql =
		typeof statement === "string"
			? statement
			: statement && typeof statement === "object" && "sql" in statement
				? statement.sql
				: undefined;
	const args =
		statement && typeof statement === "object" && "args" in statement
			? statement.args
			: positionalArgs;
	const verb =
		typeof sql === "string"
			? sql.trim().split(/\s/, 1)[0]?.toUpperCase()
			: undefined;
	return {
		statementType: [
			"SELECT",
			"INSERT",
			"UPDATE",
			"DELETE",
			"BEGIN",
			"COMMIT",
			"ROLLBACK",
			"SAVEPOINT",
			"RELEASE",
		].includes(verb ?? "")
			? verb
			: "OTHER",
		parameterCount:
			args && typeof args === "object" ? Object.keys(args).length : 0,
	};
}
