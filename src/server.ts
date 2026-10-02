import "./instrument.server";

import { withContext } from "@logtape/logtape";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { getAppLogger } from "#/lib/logging";

export default createServerEntry(
	wrapFetchWithSentry({
		async fetch(request: Request) {
			const requestId = crypto.randomUUID();
			return withContext({ requestId, method: request.method }, async () => {
				const logger = getAppLogger("http");
				const startedAt = performance.now();
				logger.debug("Request started");
				try {
					const response = await handler.fetch(request);
					const properties = {
						status: response.status,
						durationMs: Math.round(performance.now() - startedAt),
					};
					if (response.status >= 500)
						logger.warning("Request returned server failure", properties);
					else if (response.status >= 400)
						logger.warning("Request rejected", properties);
					else logger.info("Request completed", properties);
					const headers = new Headers(response.headers);
					headers.set("X-Request-Id", requestId);
					return new Response(response.body, {
						status: response.status,
						statusText: response.statusText,
						headers,
					});
				} catch (error) {
					// The Sentry fetch wrapper captures the rethrown exception.
					logger.warning("Request failed", {
						errorType: error instanceof Error ? error.name : "Unknown",
						durationMs: Math.round(performance.now() - startedAt),
					});
					throw error;
				}
			});
		},
	}),
);
