import { isEventualApiError } from "@eventual/sdk";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isUnauthenticated } from "./reliability";

export function createReliabilityQueryClient(
	onUnauthenticated: () => void,
	requireOnline: () => Promise<void>,
) {
	const onError = (error: unknown) => {
		if (isUnauthenticated(error)) onUnauthenticated();
	};
	return new QueryClient({
		mutationCache: new MutationCache({ onMutate: requireOnline, onError }),
		queryCache: new QueryCache({ onError }),
		defaultOptions: {
			// Execute the guard now; never pause a write for reconnect/replay.
			mutations: { networkMode: "always", retry: false },
			queries: {
				staleTime: 30_000,
				retry: (count, error) =>
					!isEventualApiError(error) || error.status >= 500 ? count < 2 : false,
			},
		},
	});
}
