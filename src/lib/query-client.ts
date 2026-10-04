import { QueryClient } from "@tanstack/react-query";

/**
 * One client per router, which on the server is one client per request.
 * ensureQueryData returns existing cached data, even when stale. Mounted
 * observers refresh stale reads; hover preloads reuse the cache.
 */
export function createQueryClient() {
	return new QueryClient({
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
