import { type QueryClient, useQuery } from "@tanstack/react-query";

import { sessionQueryOptions } from "#/lib/queries";

/** Drop the cached session so the next guard reads the server again. */
export function clearSession(queryClient: QueryClient) {
	queryClient.removeQueries({ queryKey: sessionQueryOptions.queryKey });
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
