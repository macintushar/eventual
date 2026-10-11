import { AsyncLocalStorage } from "node:async_hooks";

export type ReadMetrics = {
	db_query_count: number;
	db_duration_ms: number;
	db_result_rows: number;
	balance_calculation_ms: number;
};
const scope = new AsyncLocalStorage<ReadMetrics>();

export function withReadMetrics<T>(
	action: (metrics: ReadMetrics) => Promise<T>,
) {
	const metrics: ReadMetrics = {
		db_query_count: 0,
		db_duration_ms: 0,
		db_result_rows: 0,
		balance_calculation_ms: 0,
	};
	return scope.run(metrics, () => action(metrics));
}

export function measureBalanceCalculation<T>(action: () => T): T {
	const started = performance.now();
	try {
		return action();
	} finally {
		const metrics = scope.getStore();
		if (metrics) metrics.balance_calculation_ms += performance.now() - started;
	}
}

/** Instrument driver calls, including transactions. Never collect SQL, parameters or row contents. */
export function instrumentDatabase<T extends object>(client: T): T {
	return new Proxy(client, {
		get(target, key, receiver) {
			const value = Reflect.get(target, key, receiver);
			if (typeof value !== "function") return value;
			if (key === "transaction")
				return async (...args: unknown[]) =>
					instrumentDatabase(await value.apply(target, args));
			if (key !== "execute" && key !== "batch" && key !== "migrate")
				return value.bind(target);
			return async (...args: unknown[]) => {
				const metrics = scope.getStore();
				if (!metrics) return value.apply(target, args);
				metrics.db_query_count += Array.isArray(args[0]) ? args[0].length : 1;
				const started = performance.now();
				try {
					const result = await value.apply(target, args);
					for (const item of Array.isArray(result) ? result : [result])
						metrics.db_result_rows += item?.rows?.length ?? 0;
					return result;
				} finally {
					metrics.db_duration_ms += performance.now() - started;
				}
			};
		},
	});
}
