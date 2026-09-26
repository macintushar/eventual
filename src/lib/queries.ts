import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
	getActivityFn,
	getComposerFn,
	getDashboardFn,
	getExpenseFn,
	getGroupPageFn,
	getInvitationFn,
	getLegalInfoFn,
	getMyActivityFn,
	getPendingVerificationFn,
	getSessionFn,
	getSiteFn,
	listApiKeysFn,
	searchExpensesFn,
} from "#/lib/web-api-client";
import type { ExpenseSortBy } from "#/server/schemas/expenses";

const staticStaleTime = 10 * 60_000;
export const expensePageSize = 30;

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
) =>
	queryOptions({
		queryKey: [
			"group",
			groupId,
			"expenses",
			{ search, sortBy, sortDirection, offset },
		] as const,
		queryFn: ({ signal }) =>
			searchExpensesFn({
				data: {
					groupId,
					search: search || undefined,
					limit: expensePageSize,
					offset,
					sortBy,
					sortDirection,
				},
				signal,
			}),
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
	queryKey: ["activity", "mine"] as const,
	queryFn: ({ pageParam, signal }) =>
		getMyActivityFn({ data: { cursor: pageParam }, signal }),
	initialPageParam: undefined as string | undefined,
	getNextPageParam: (last) => last.nextCursor ?? undefined,
});

export const groupActivityInfiniteOptions = (groupId: string) =>
	infiniteQueryOptions({
		queryKey: ["group", groupId, "activity"] as const,
		queryFn: ({ pageParam, signal }) =>
			getActivityFn({ data: { groupId, cursor: pageParam }, signal }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
	});
