import { type QueryClient, useQuery } from "@tanstack/react-query";

import { sessionQueryOptions } from "#/lib/queries";

// Queries whose data is the same for every visitor. Everything else belongs to
// whoever was signed in when it was fetched.
const publicQueryKeys = new Set<unknown>(["legal", "site"]);
const cacheOwners = new WeakMap<QueryClient, string>();

function clearAccountQueries(queryClient: QueryClient, keepSession = false) {
	queryClient.removeQueries({
		predicate: (query) =>
			!publicQueryKeys.has(query.queryKey[0]) &&
			!(keepSession && query.queryKey[0] === sessionQueryOptions.queryKey[0]),
	});
}

/**
 * Drop the cached session, and every account-scoped query with it, so the next
 * guard reads the server again and no page renders the previous user's data.
 */
export function clearSession(queryClient: QueryClient) {
	cacheOwners.delete(queryClient);
	clearAccountQueries(queryClient);
}

/**
 * Tie the cache to the signed-in user. If another tab switched accounts, the
 * cached groups and expenses belong to someone else and must be refetched.
 */
export function claimAccountCache(queryClient: QueryClient, userId: string) {
	const owner = cacheOwners.get(queryClient);
	if (owner && owner !== userId) clearAccountQueries(queryClient, true);
	cacheOwners.set(queryClient, userId);
}

/**
 * The signed-in user on prerendered public pages. The query stays disabled
 * during SSR so a static page never bakes one visitor's session into the HTML
 * everyone else receives. It starts empty and fills in after hydration.
 */
export function useClientUser() {
	const query = useQuery({
		...sessionQueryOptions,
		enabled: !import.meta.env.SSR,
	});
	return query.data?.user ?? null;
}
