import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
	getActivityFn,
	getCategoryBackfillFn,
	getComposerFn,
	getDashboardFn,
	getExpenseFn,
	getExpensePageFn,
	getGroupContextFn,
	getGroupDirectoryFn,
	getGroupInvitationsFn,
	getGroupPageFn,
	getGroupSettingsFn,
	getGroupSummaryFn,
	getInvitationFn,
	getLegalInfoFn,
	getMyActivityFn,
	getMyInvitationsFn,
	getPendingVerificationFn,
	getRecurringFn,
	getSessionFn,
	getSettlementPageFn,
	getSiteFn,
	listApiKeysFn,
	searchExpensesFn,
} from "#/lib/web-api-client";
import type { ExpenseSortBy } from "#/server/schemas/expenses";

const staticStaleTime = 10 * 60_000;
export const expensePageSize = 30;

// History lists catch up on their own when the tab regains focus or the
// network returns, at most once a minute. An infinite query refetches every
// loaded page in sequence from the first cursor, so rows other people added
// appear without a manual refresh and the cursors stay consistent.
const historyOptions = {
	staleTime: 60_000,
	refetchOnWindowFocus: true,
	refetchOnReconnect: true,
};
export const groupContextQueryOptions = (groupId: string) =>
	queryOptions({
		queryKey: ["group", groupId, "context"] as const,
		queryFn: ({ signal }) => getGroupContextFn(groupId, signal),
	});
export const groupSummaryQueryOptions = (groupId: string) =>
	queryOptions({
		queryKey: ["group", groupId, "financial-summary"] as const,
		queryFn: ({ signal }) => getGroupSummaryFn(groupId, signal),
	});
export const groupSettingsQueryOptions = (groupId: string) =>
	queryOptions({
		queryKey: ["group", groupId, "settings"] as const,
		queryFn: ({ signal }) => getGroupSettingsFn(groupId, signal),
	});
export const recurringQueryOptions = (groupId: string) =>
	queryOptions({
		queryKey: ["group", groupId, "recurring"] as const,
		queryFn: ({ signal }) => getRecurringFn(groupId, signal),
	});
export const groupInvitationsQueryOptions = (groupId: string) =>
	queryOptions({
		queryKey: ["group", groupId, "invitations"] as const,
		queryFn: ({ signal }) => getGroupInvitationsFn(groupId, signal),
	});
export const groupDirectoryQueryOptions = queryOptions({
	queryKey: ["groups", "directory"] as const,
	queryFn: ({ signal }) => getGroupDirectoryFn(signal),
});
export const expensesInfiniteOptions = (
	groupId: string,
	search = "",
	sortBy: ExpenseSortBy = "date",
	sortDirection: "asc" | "desc" = "desc",
) =>
	infiniteQueryOptions({
		...historyOptions,
		queryKey: [
			"group",
			groupId,
			"expenses",
			{ search, sortBy, sortDirection, limit: expensePageSize },
		] as const,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			getExpensePageFn(
				{
					groupId,
					search: search || undefined,
					sortBy,
					sortDirection,
					cursor: pageParam,
					limit: expensePageSize,
				},
				signal,
			),
		getNextPageParam: (last) => last.nextCursor ?? undefined,
	});
export const settlementsInfiniteOptions = (groupId: string) =>
	infiniteQueryOptions({
		...historyOptions,
		queryKey: ["group", groupId, "settlements"] as const,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			getSettlementPageFn({ groupId, cursor: pageParam }, signal),
		getNextPageParam: (last) => last.nextCursor ?? undefined,
	});

export const sessionQueryOptions = queryOptions({
	queryKey: ["session"] as const,
	queryFn: ({ signal }) => getSessionFn(signal),
	staleTime: 60_000,
});

export const dashboardQueryOptions = queryOptions({
	queryKey: ["dashboard"] as const,
	queryFn: ({ signal }) => getDashboardFn(signal),
});

export const composerQueryOptions = queryOptions({
	queryKey: ["composer"] as const,
	queryFn: ({ signal }) => getComposerFn(signal),
});

export const groupPageQueryOptions = (groupId: string) =>
	queryOptions({
		queryKey: ["group", groupId, "page"] as const,
		queryFn: ({ signal }) => getGroupPageFn({ data: { groupId }, signal }),
	});

/** Under the group key, so any category or expense write refreshes it. */
export const categoryBackfillQueryOptions = (
	groupId: string,
	ruleId?: string,
) =>
	queryOptions({
		queryKey: ["group", groupId, "category-backfill", ruleId ?? null] as const,
		queryFn: ({ signal }) =>
			getCategoryBackfillFn({ data: { groupId, ruleId }, signal }),
	});

export const expenseQueryOptions = (expenseId: string) =>
	queryOptions({
		queryKey: ["expense", expenseId] as const,
		queryFn: ({ signal }) => getExpenseFn({ data: { expenseId }, signal }),
	});

export const expensePageQueryOptions = (
	groupId: string,
	search: string,
	sortBy: ExpenseSortBy,
	sortDirection: "asc" | "desc",
	offset: number,
	asOf?: number,
) =>
	queryOptions({
		queryKey: [
			"group",
			groupId,
			"expenses",
			{ search, sortBy, sortDirection, offset, asOf },
		] as const,
		queryFn: ({ signal }) =>
			searchExpensesFn({
				data: {
					groupId,
					search: search || undefined,
					limit: expensePageSize,
					offset,
					asOf,
					sortBy,
					sortDirection,
				},
				signal,
			}),
	});

/** Under the `invitation` prefix, so accepting or revoking refreshes it. */
export const myInvitationsQueryOptions = queryOptions({
	queryKey: ["invitation", "mine"] as const,
	queryFn: ({ signal }) => getMyInvitationsFn(signal),
});

export const invitationQueryOptions = (invitationId: string) =>
	queryOptions({
		queryKey: ["invitation", invitationId] as const,
		queryFn: ({ signal }) =>
			getInvitationFn({ data: { invitationId }, signal }),
	});

export const apiKeysQueryOptions = queryOptions({
	queryKey: ["api-keys"] as const,
	queryFn: ({ signal }) => listApiKeysFn(signal),
});

export const legalQueryOptions = queryOptions({
	queryKey: ["legal"] as const,
	queryFn: ({ signal }) => getLegalInfoFn(signal),
	staleTime: staticStaleTime,
});

export const siteQueryOptions = queryOptions({
	queryKey: ["site"] as const,
	queryFn: ({ signal }) => getSiteFn(signal),
	staleTime: staticStaleTime,
});

export const pendingVerificationQueryOptions = queryOptions({
	queryKey: ["pending-verification"] as const,
	queryFn: ({ signal }) => getPendingVerificationFn(signal),
});

export const myActivityInfiniteOptions = infiniteQueryOptions({
	...historyOptions,
	queryKey: ["activity", "mine"] as const,
	queryFn: ({ pageParam, signal }) =>
		getMyActivityFn({ data: { cursor: pageParam }, signal }),
	initialPageParam: undefined as string | undefined,
	getNextPageParam: (last) => last.nextCursor ?? undefined,
});

export const groupActivityInfiniteOptions = (groupId: string) =>
	infiniteQueryOptions({
		...historyOptions,
		queryKey: ["group", groupId, "activity"] as const,
		queryFn: ({ pageParam, signal }) =>
			getActivityFn({ data: { groupId, cursor: pageParam }, signal }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
	});
