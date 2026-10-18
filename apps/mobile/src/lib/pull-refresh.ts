import { useState } from "react";

/**
 * State for a RefreshControl that is on only while the user's own pull is
 * refetching. Binding `refreshing` to a query's `isRefetching` also flips it
 * on background refetches, which makes iOS start and end a refresh the user
 * never made and leaves the scroll view shifted down.
 */
export function usePullRefresh(refetch: () => Promise<unknown>) {
	const [refreshing, setRefreshing] = useState(false);
	return {
		refreshing,
		onRefresh: () => {
			setRefreshing(true);
			const done = () => setRefreshing(false);
			void refetch().then(done, done);
		},
	};
}
