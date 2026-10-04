import type { Ctx } from "#/server/context";
import { withReadMetrics } from "#/server/performance";
import { captureEvent } from "#/server/telemetry";

export function measuredOperation<T>(
	ctx: Ctx,
	operation: string,
	surface: "web" | "rest" | "mcp" | "shortcut",
	action: () => Promise<T>,
) {
	return withReadMetrics(async (metrics) => {
		const started = performance.now();
		let success = false;
		let resultCount: number | undefined;
		try {
			const result = await action();
			success = true;
			if (Array.isArray(result)) resultCount = result.length;
			else if (
				result &&
				typeof result === "object" &&
				"items" in result &&
				Array.isArray(result.items)
			)
				resultCount = result.items.length;
			return result;
		} finally {
			captureEvent({
				event: "operation_completed",
				distinctId: ctx.user.id,
				properties: {
					operation,
					surface,
					success,
					duration_ms: Math.round(performance.now() - started),
					...metrics,
					result_count: resultCount,
				},
			});
		}
	});
}
