import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { getAppLogger } from "#/lib/logging";

/**
 * One client per router, which on the server is one client per request.
 * ensureQueryData returns existing cached data, even when stale. Mounted
 * observers refresh stale reads; hover preloads reuse the cache.
 */
export function createQueryClient() {
	return new QueryClient({
		queryCache: new QueryCache({
			onError: (_error, query) =>
				getAppLogger("queries").warning("Query failed", {
					resource:
						typeof query.queryKey[0] === "string"
							? query.queryKey[0]
							: "unknown",
				}),
			onSuccess: (_data, query) =>
				getAppLogger("queries").debug("Query completed", {
					resource:
						typeof query.queryKey[0] === "string"
							? query.queryKey[0]
							: "unknown",
				}),
		}),
		mutationCache: new MutationCache({
			onMutate: () => {
				getAppLogger("mutations").debug("Mutation started");
			},
			onSuccess: () => {
				getAppLogger("mutations").info("Mutation completed");
			},
			onError: () => {
				getAppLogger("mutations").warning("Mutation failed");
			},
		}),
		defaultOptions: {
			queries: {
				staleTime: 30_000,
				gcTime: 5 * 60_000,
				retry: (count, error) => {
					const status = "status" in error ? Number(error.status) : 0;
					if (status >= 400 && status < 500 && status !== 408 && status !== 429)
						return false;
					return count < 1;
				},
				refetchOnWindowFocus: true,
				refetchOnReconnect: true,
			},
			mutations: {
				retry: 0,
			},
		},
	});
}
