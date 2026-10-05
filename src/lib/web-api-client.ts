import { redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import type { z } from "zod";
import { routes } from "#/lib/api-client.gen";
import { apiErrorMessage } from "#/lib/api-error";
import { getAppLogger, responseRequestContext } from "#/lib/logging";
import type { MutationInput, MutationOperation } from "#/server/operations";
import type { updateProfileSchema } from "#/server/schemas";
import type { createApiKeySchema } from "#/server/schemas/account";
import type {
	expensePageSchema,
	listExpensesSchema,
} from "#/server/schemas/expenses";
import type { ApiKeySummary } from "#/server/web-api";

export type { ApiKeySummary } from "#/server/web-api";

let cacheRevision = 0;

export function isApiNotFound(error: unknown) {
	return error instanceof Error && "status" in error && error.status === 404;
}

function routePath(path: string, input: Record<string, unknown>) {
	const used = new Set<string>();
	const pathname = path.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
		used.add(key);
		return encodeURIComponent(String(input[key]));
	});
	const url = new URL(`http://local/api${pathname}`);
	for (const [key, value] of Object.entries(input)) {
		if (used.has(key) || value == null) continue;
		for (const item of Array.isArray(value) ? value : [value])
			url.searchParams.append(
				key,
				item instanceof Date ? item.toISOString() : String(item),
			);
	}
	return `${url.pathname}${url.search}`;
}

const performRequest = createIsomorphicFn()
	.server(
		async (
			method: string,
			path: string,
			body?: unknown,
			signal?: AbortSignal,
		) => {
			const [{ getRequest }, { dispatchApi }] = await Promise.all([
				import("@tanstack/react-start/server"),
				import("#/server/http"),
			]);
			const source = getRequest();
			const url = new URL(path, source.url);
			const forwarded = new Headers(source.headers);
			if (body !== undefined) forwarded.set("Content-Type", "application/json");
			return dispatchApi(
				new Request(url, {
					method,
					headers: forwarded,
					body: body === undefined ? undefined : JSON.stringify(body),
					signal,
				}),
				`${url.pathname.replace(/^\/api\/?/, "")}`,
			);
		},
	)
	.client(
		(method: string, path: string, body?: unknown, signal?: AbortSignal) => {
			const headers = new Headers();
			if (body !== undefined) headers.set("Content-Type", "application/json");
			const url = new URL(path, window.location.origin);
			if (method === "GET" && cacheRevision)
				url.searchParams.set("_revision", String(cacheRevision));
			return fetch(url, {
				method,
				headers,
				credentials: "same-origin",
				body: body === undefined ? undefined : JSON.stringify(body),
				signal,
				// React Query is the cache. A short HTTP max-age would serve the
				// pre-mutation response to the refetch that invalidation triggers.
				cache: "no-store",
			});
		},
	);

const currentPath = createIsomorphicFn()
	.server(async () => {
		const { getRequest } = await import("@tanstack/react-start/server");
		const current = new URL(getRequest().url);
		return `${current.pathname}${current.search}`;
	})
	.client(() => `${window.location.pathname}${window.location.search}`);

async function apiRequest<T>(
	operation: string,
	method: string,
	path: string,
	body?: unknown,
	signal?: AbortSignal,
): Promise<T> {
	const logger = getAppLogger("api-client").with({ method, operation });
	const startedAt = performance.now();
	logger.debug("API request started");
	let response: Response;
	try {
		response = await performRequest(method, path, body, signal);
	} catch (error) {
		logger.warning(
			signal?.aborted ? "API request cancelled" : "API transport failed",
			{ errorType: error instanceof Error ? error.name : "Unknown" },
		);
		throw error;
	}
	logger[response.ok ? "debug" : "warning"]("API response received", {
		status: response.status,
		...responseRequestContext(response),
		durationMs: Math.round(performance.now() - startedAt),
	});
	const result = await response.json();
	if (!response.ok) {
		if (
			response.status === 401 &&
			!path.startsWith("/api/v1/pending-verification/send")
		) {
			const destination = await currentPath();
			if (import.meta.env.SSR)
				throw redirect({ to: "/login", search: { redirect: destination } });
			window.location.assign(
				`/login?redirect=${encodeURIComponent(destination)}`,
			);
		}
		throw Object.assign(new Error(apiErrorMessage(result?.error)), {
			status: response.status,
			details: result?.error,
		});
	}
	if (method !== "GET" && !import.meta.env.SSR) cacheRevision++;
	return result as T;
}

function operationRequest<T>(
	name: keyof typeof routes,
	input: Record<string, unknown>,
	signal?: AbortSignal,
) {
	const route = routes[name];
	const path = routePath(route.path, input);
	return apiRequest<T>(
		name,
		route.method,
		path,
		route.method === "GET" ? undefined : input,
		signal,
	);
}

type WebApi = typeof import("#/server/web-api");
type Services = typeof import("#/server/services/app");
type MutationResult = Awaited<ReturnType<MutationOperation["handler"]>>;

export const getGroupContextFn = (groupId: string, signal?: AbortSignal) =>
	apiRequest<Awaited<ReturnType<WebApi["groupContext"]>>>(
		"app.groupContext",
		"GET",
		`/api/v1/app/groups/${encodeURIComponent(groupId)}/context`,
		undefined,
		signal,
	);
export const getGroupSummaryFn = (groupId: string, signal?: AbortSignal) =>
	apiRequest<Awaited<ReturnType<WebApi["groupSummary"]>>>(
		"app.groupSummary",
		"GET",
		`/api/v1/app/groups/${encodeURIComponent(groupId)}/financial-summary`,
		undefined,
		signal,
	);
export const getGroupSettingsFn = (groupId: string, signal?: AbortSignal) =>
	apiRequest<Awaited<ReturnType<WebApi["groupSettings"]>>>(
		"app.groupSettings",
		"GET",
		`/api/v1/app/groups/${encodeURIComponent(groupId)}/settings`,
		undefined,
		signal,
	);
export const getGroupDirectoryFn = (signal?: AbortSignal) =>
	apiRequest<Awaited<ReturnType<WebApi["groupDirectory"]>>>(
		"app.groupDirectory",
		"GET",
		"/api/v1/app/group-directory",
		undefined,
		signal,
	);
export const getRecurringFn = (groupId: string, signal?: AbortSignal) =>
	operationRequest<Awaited<ReturnType<Services["listRecurringExpenses"]>>>(
		"recurring.list",
		{ groupId },
		signal,
	);
export const getGroupInvitationsFn = (groupId: string, signal?: AbortSignal) =>
	operationRequest<Awaited<ReturnType<Services["listInvitations"]>>>(
		"invitation.list",
		{ groupId },
		signal,
	);
export const getExpensePageFn = (
	data: z.input<typeof expensePageSchema>,
	signal?: AbortSignal,
) =>
	operationRequest<Awaited<ReturnType<Services["listExpensePage"]>>>(
		"expense.page",
		data,
		signal,
	);
export const getSettlementPageFn = (
	data: { groupId: string; cursor?: string },
	signal?: AbortSignal,
) =>
	operationRequest<Awaited<ReturnType<Services["listSettlementPage"]>>>(
		"settlement.page",
		data,
		signal,
	);

export const getDashboardFn = (signal?: AbortSignal) =>
	apiRequest<Awaited<ReturnType<WebApi["dashboard"]>>>(
		"dashboard.get",
		"GET",
		"/api/v1/app/dashboard",
		undefined,
		signal,
	);

export const getComposerFn = (signal?: AbortSignal) =>
	apiRequest<Awaited<ReturnType<WebApi["composer"]>>>(
		"composer.get",
		"GET",
		"/api/v1/app/composer",
		undefined,
		signal,
	);

export const getGroupPageFn = ({
	data,
	signal,
}: {
	data: { groupId: string };
	signal?: AbortSignal;
}) =>
	apiRequest<Awaited<ReturnType<WebApi["groupPage"]>>>(
		"group.page",
		"GET",
		`/api/v1/app/groups/${encodeURIComponent(data.groupId)}/page`,
		undefined,
		signal,
	);

export const getActivityFn = ({
	data,
	signal,
}: {
	data: { groupId: string; cursor?: string };
	signal?: AbortSignal;
}) =>
	operationRequest<Awaited<ReturnType<Services["listActivity"]>>>(
		"activity.group",
		data,
		signal,
	);

export const getMyActivityFn = ({
	data,
	signal,
}: {
	data: { cursor?: string };
	signal?: AbortSignal;
}) =>
	operationRequest<Awaited<ReturnType<Services["listMyActivity"]>>>(
		"activity.mine",
		data,
		signal,
	);

export const getExpenseFn = ({
	data,
	signal,
}: {
	data: { expenseId: string };
	signal?: AbortSignal;
}) =>
	operationRequest<Awaited<ReturnType<Services["getExpense"]>>>(
		"expense.get",
		data,
		signal,
	);

export const searchExpensesFn = ({
	data,
	signal,
}: {
	data: z.input<typeof listExpensesSchema>;
	signal?: AbortSignal;
}) =>
	operationRequest<Awaited<ReturnType<Services["listExpenses"]>>>(
		"expense.list",
		data,
		signal,
	);

export const getCategoryBackfillFn = ({
	data,
	signal,
}: {
	data: { groupId: string; ruleId?: string };
	signal?: AbortSignal;
}) =>
	operationRequest<Awaited<ReturnType<Services["previewCategoryBackfill"]>>>(
		"category.backfillPreview",
		data,
		signal,
	);

export const getMyInvitationsFn = (signal?: AbortSignal) =>
	operationRequest<Awaited<ReturnType<Services["listMyInvitations"]>>>(
		"invitation.mine",
		{},
		signal,
	);

export const getInvitationFn = ({
	data,
	signal,
}: {
	data: { invitationId: string };
	signal?: AbortSignal;
}) =>
	operationRequest<Awaited<ReturnType<Services["getInvitation"]>>>(
		"invitation.get",
		data,
		signal,
	);

export const mutateFn = ({ data }: { data: MutationInput }) =>
	operationRequest<MutationResult>(data.action, data.input);

export const getSessionFn = (signal?: AbortSignal) =>
	apiRequest<Awaited<ReturnType<WebApi["session"]>>>(
		"session.get",
		"GET",
		"/api/v1/session",
		undefined,
		signal,
	);

export const getPendingVerificationFn = (signal?: AbortSignal) =>
	apiRequest<{ email: string } | null>(
		"verification.pending",
		"GET",
		"/api/v1/pending-verification",
		undefined,
		signal,
	);

export const sendPendingVerificationFn = (next?: string) =>
	apiRequest<{ sent: boolean; retryAt: string }>(
		"verification.send",
		"POST",
		next
			? `/api/v1/pending-verification/send?next=${encodeURIComponent(next)}`
			: "/api/v1/pending-verification/send",
	);

export const getLegalInfoFn = (signal?: AbortSignal) =>
	apiRequest<import("#/server/legal").LegalInfo>(
		"legal.get",
		"GET",
		"/api/v1/legal",
		undefined,
		signal,
	);

export const getSiteFn = (signal?: AbortSignal) =>
	apiRequest<{
		origin: string;
		supportEmail: string | null;
		googleSignIn: boolean;
		statusPageUrl: string | null;
	}>("site.get", "GET", "/api/v1/site", undefined, signal);

export const listApiKeysFn = (signal?: AbortSignal) =>
	apiRequest<ApiKeySummary[]>(
		"api-key.list",
		"GET",
		"/api/v1/me/api-keys",
		undefined,
		signal,
	);

export const createApiKeyFn = ({
	data,
}: {
	data: z.input<typeof createApiKeySchema>;
}) =>
	apiRequest<{ key: string; record: ApiKeySummary }>(
		"api-key.create",
		"POST",
		"/api/v1/me/api-keys",
		data,
	);

export const deleteApiKeyFn = ({ data }: { data: { keyId: string } }) =>
	apiRequest<{ success: true }>(
		"api-key.delete",
		"DELETE",
		`/api/v1/me/api-keys/${encodeURIComponent(data.keyId)}`,
	);

export const updateProfileFn = ({
	data,
}: {
	data: z.input<typeof updateProfileSchema>;
}) =>
	apiRequest<Awaited<ReturnType<WebApi["profile"]>>>(
		"profile.update",
		"PATCH",
		"/api/v1/me/profile",
		data,
	);
