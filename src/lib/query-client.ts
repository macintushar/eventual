import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { getAppLogger } from "#/lib/logging";

/**
 * One client per router, which on the server is one client per request.
 * Freshness lives here: route loaders call `ensureQueryData`, and a 30s
 * stale time means a hover-preload does not refetch data that is still fresh.
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
				retry: 1,
				refetchOnWindowFocus: true,
				refetchOnReconnect: true,
			},
			mutations: {
				retry: 0,
			},
		},
	});
}
