import { QueryClient } from "@tanstack/react-query";

/**
 * One client per router, which on the server is one client per request.
 * Freshness lives here: route loaders call `ensureQueryData`, and a 30s
 * stale time means a hover-preload does not refetch data that is still fresh.
 */
export function createQueryClient() {
	return new QueryClient({
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
