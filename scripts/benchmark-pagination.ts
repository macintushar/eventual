import { paginationFixture } from "../src/server/services/pagination-fixture";
import { listExpensePage } from "../src/server/services/expense-pages";
import { readBalances } from "../src/server/services/balances";
import { withReadMetrics } from "../src/server/performance";

for (const size of [100, 1000, 10000]) {
	const { client, ctx, users } = await paginationFixture(size);
	try {
		let cursor: string | undefined;
		const first = await listExpensePage(ctx, { groupId: "G" });
		cursor = first.nextCursor ?? undefined;
		for (let i = 0; i < Math.floor(size / 30) - 2 && cursor; i++) {
			cursor = (await listExpensePage(ctx, { groupId: "G", cursor })).nextCursor ?? undefined;
		}
		for (const [name, action] of [
			["first", () => listExpensePage(ctx, { groupId: "G" })],
			["deep", () => listExpensePage(ctx, { groupId: "G", cursor })],
			["summary", () => readBalances(ctx.db, "G", users.map((row) => ({ userId: row.id, name: row.name })))],
		] as const) {
			const samples: number[] = [];
			await withReadMetrics(async (metrics) => {
				for (let i = 0; i < 20; i++) {
					const start = performance.now(); await action(); samples.push(performance.now() - start);
				}
				samples.sort((a, b) => a - b);
				console.log(JSON.stringify({ size, name, p50_ms: samples[9], p95_ms: samples[18], queries_per_call: metrics.db_query_count / 20, returned_db_rows_per_call: metrics.db_result_rows / 20 }));
			});
		}
	} finally { client.close(); }
}
