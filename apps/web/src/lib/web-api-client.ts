import { endpoints } from "@eventual/schemas/contract";
import {
	createEventualClient,
	type EndpointInput,
	type EndpointName,
	type EndpointOutput,
	isEventualApiError,
	type MutationInput,
	type RequestOptions,
} from "@eventual/sdk";
import { redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getAppLogger, responseRequestContext } from "#/lib/logging";

let cacheRevision = 0;

export function isApiNotFound(error: unknown) {
	return isEventualApiError(error) && error.status === 404;
}

const performRequest = createIsomorphicFn()
	.server(async (path: string, init: RequestInit) => {
		const [{ getRequest }, { dispatchApi }] = await Promise.all([
			import("@tanstack/react-start/server"),
			import("#/server/http"),
		]);
		const source = getRequest();
		const url = new URL(path, source.url);
		const forwarded = new Headers(source.headers);
		for (const [key, value] of new Headers(init.headers))
			forwarded.set(key, value);
		return dispatchApi(
			new Request(url, { ...init, headers: forwarded }),
			`${url.pathname.replace(/^\/api\/?/, "")}`,
		);
	})
	.client((path: string, init: RequestInit) => {
		const url = new URL(path, window.location.origin);
		if (init.method === "GET" && cacheRevision)
			url.searchParams.set("_revision", String(cacheRevision));
		return fetch(url, {
			...init,
			credentials: "same-origin",
			// React Query is the cache. A short HTTP max-age would serve the
			// pre-mutation response to the refetch that invalidation triggers.
			cache: "no-store",
		});
	});

const currentPath = createIsomorphicFn()
	.server(async () => {
		const { getRequest } = await import("@tanstack/react-start/server");
		const current = new URL(getRequest().url);
		return `${current.pathname}${current.search}`;
	})
	.client(() => `${window.location.pathname}${window.location.search}`);

const endpointPatterns = endpoints.map((endpoint) => ({
	name: endpoint.name,
	method: endpoint.method,
	pattern: new RegExp(`^/api${endpoint.path.replace(/:[^/]+/g, "[^/]+")}$`),
}));

/** Logs name the endpoint, never the URL: paths carry ids. */
function endpointLabel(method: string, pathname: string) {
	return (
		endpointPatterns.find(
			(endpoint) =>
				endpoint.method === method && endpoint.pattern.test(pathname),
		)?.name ?? "unknown"
	);
}

/**
 * The SDK's transport for this app: in-process dispatch during SSR, a
 * same-origin fetch in the browser, a login redirect on 401, and a cache
 * revision that keeps GETs after a mutation from hitting the HTTP cache.
 */
const webFetch = async (
	resource: string | URL | Request,
	init: RequestInit = {},
) => {
	const url = new URL(String(resource), "http://local");
	const path = `${url.pathname}${url.search}`;
	const method = init.method ?? "GET";
	const logger = getAppLogger("api-client").with({
		method,
		operation: endpointLabel(method, url.pathname),
	});
	const startedAt = performance.now();
	logger.debug("API request started");
	let response: Response;
	try {
		response = await performRequest(path, init);
	} catch (error) {
		logger.warning(
			init.signal?.aborted ? "API request cancelled" : "API transport failed",
			{ errorType: error instanceof Error ? error.name : "Unknown" },
		);
		throw error;
	}
	logger[response.ok ? "debug" : "warning"]("API response received", {
		status: response.status,
		...responseRequestContext(response),
		durationMs: Math.round(performance.now() - startedAt),
	});
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
	if (response.ok && method !== "GET" && !import.meta.env.SSR) cacheRevision++;
	return response;
};

const client = createEventualClient({ baseUrl: "", fetch: webFetch });

/**
 * Typed per endpoint at each call site below; erased here because generic
 * callers can't satisfy `call`'s optional-input overloads.
 */
const callEndpoint = client.call as (
	name: EndpointName,
	input: unknown,
	options: RequestOptions,
) => Promise<unknown>;

function endpointRequest<Name extends EndpointName>(
	name: Name,
	input: EndpointInput<Name>,
	signal?: AbortSignal,
) {
	return callEndpoint(name, input, { signal }) as Promise<EndpointOutput<Name>>;
}

export type { ApiKeySummary } from "@eventual/schemas/account";
export type MutationResult = EndpointOutput<MutationInput["action"]>;

export const getGroupContextFn = (groupId: string, signal?: AbortSignal) =>
	endpointRequest("app.groupContext", { groupId }, signal);
export const getGroupSummaryFn = (groupId: string, signal?: AbortSignal) =>
	endpointRequest("app.groupSummary", { groupId }, signal);
export const getGroupSettingsFn = (groupId: string, signal?: AbortSignal) =>
	endpointRequest("app.groupSettings", { groupId }, signal);
export const getGroupDirectoryFn = (signal?: AbortSignal) =>
	endpointRequest("app.groupDirectory", {}, signal);
export const getRecurringFn = (groupId: string, signal?: AbortSignal) =>
	endpointRequest("recurring.list", { groupId }, signal);
export const getGroupInvitationsFn = (groupId: string, signal?: AbortSignal) =>
	endpointRequest("invitation.list", { groupId }, signal);
export const getExpensePageFn = (
	data: EndpointInput<"expense.page">,
	signal?: AbortSignal,
) => endpointRequest("expense.page", data, signal);
export const getSettlementPageFn = (
	data: { groupId: string; cursor?: string },
	signal?: AbortSignal,
) => endpointRequest("settlement.page", data, signal);

export const getDashboardFn = (signal?: AbortSignal) =>
	endpointRequest("app.dashboard", {}, signal);

export const getComposerFn = (signal?: AbortSignal) =>
	endpointRequest("app.composer", {}, signal);

export const getGroupPageFn = ({
	data,
	signal,
}: {
	data: { groupId: string };
	signal?: AbortSignal;
}) => endpointRequest("app.groupPage", data, signal);

export const getActivityFn = ({
	data,
	signal,
}: {
	data: { groupId: string; cursor?: string };
	signal?: AbortSignal;
}) => endpointRequest("activity.group", data, signal);

export const getMyActivityFn = ({
	data,
	signal,
}: {
	data: { cursor?: string };
	signal?: AbortSignal;
}) => endpointRequest("activity.mine", data, signal);

export const getExpenseFn = ({
	data,
	signal,
}: {
	data: { expenseId: string };
	signal?: AbortSignal;
}) => endpointRequest("expense.get", data, signal);

export const searchExpensesFn = ({
	data,
	signal,
}: {
	data: EndpointInput<"expense.list">;
	signal?: AbortSignal;
}) => endpointRequest("expense.list", data, signal);

export const getCategoryBackfillFn = ({
	data,
	signal,
}: {
	data: { groupId: string; ruleId?: string };
	signal?: AbortSignal;
}) => endpointRequest("category.backfillPreview", data, signal);

export const getMyInvitationsFn = (signal?: AbortSignal) =>
	endpointRequest("invitation.mine", {}, signal);

export const getInvitationFn = ({
	data,
	signal,
}: {
	data: { invitationId: string };
	signal?: AbortSignal;
}) => endpointRequest("invitation.get", data, signal);

export const mutateFn = ({ data }: { data: MutationInput }) =>
	endpointRequest(
		data.action,
		data.input as EndpointInput<typeof data.action>,
	) as Promise<MutationResult>;

export const getSessionFn = (signal?: AbortSignal) =>
	endpointRequest("session.get", {}, signal);

export const getPendingVerificationFn = (signal?: AbortSignal) =>
	endpointRequest("verification.pending", {}, signal);

export const sendPendingVerificationFn = (next?: string) =>
	endpointRequest("verification.send", { next });

export const getLegalInfoFn = (signal?: AbortSignal) =>
	endpointRequest("legal.get", {}, signal);

export const getSiteFn = (signal?: AbortSignal) =>
	endpointRequest("site.get", {}, signal);

export const listApiKeysFn = (signal?: AbortSignal) =>
	endpointRequest("apiKey.list", {}, signal);

export const createApiKeyFn = ({
	data,
}: {
	data: EndpointInput<"apiKey.create">;
}) => endpointRequest("apiKey.create", data);

export const deleteApiKeyFn = ({ data }: { data: { keyId: string } }) =>
	endpointRequest("apiKey.delete", data);

export const updateProfileFn = ({
	data,
}: {
	data: EndpointInput<"profile.update">;
}) => endpointRequest("profile.update", data);
