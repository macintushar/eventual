import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./session";

/** One group's screens: header, members and balances. */
export function useGroupContext(groupId: string) {
	const api = useApi();
	return useQuery({
		queryKey: ["group", groupId, "context"],
		queryFn: () => api.call("app.groupContext", { groupId }),
	});
}

export function useGroupSummary(groupId: string) {
	const api = useApi();
	return useQuery({
		queryKey: ["group", groupId, "summary"],
		queryFn: () => api.call("app.groupSummary", { groupId }),
	});
}

/**
 * After a write that moves money: the group's lists and balances, the
 * dashboard totals, the personal activity feed, and any open expense
 * (recording a payment can mark shares paid) all refetch.
 */
export function useRefreshAfterWrite() {
	const queryClient = useQueryClient();
	return (groupId: string) =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: ["group", groupId] }),
			queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
			queryClient.invalidateQueries({ queryKey: ["expense"] }),
			queryClient.invalidateQueries({ queryKey: ["activity"] }),
		]);
}
