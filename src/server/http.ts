import { createHash } from "node:crypto";
import { role } from "better-auth/plugins/access";
import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";

import { idempotencyKey } from "#/db/schema";
import { presentedApiKey } from "#/lib/auth";
import { getAppLogger } from "#/lib/logging";
import { canImpersonate } from "#/lib/permissions";
import { buildContext, type Ctx } from "#/server/context";
import { reportError } from "#/server/error-reporting";
import { AppError, errorStatus } from "#/server/errors";
import { runJobsRequest } from "#/server/jobs";
import { measuredOperation } from "#/server/measured-operation";
import { openApiDocument } from "#/server/openapi";
import {
	executeOperation,
	invokeOperation,
	type Operation,
	operations,
} from "#/server/operations";
import * as webApi from "#/server/web-api";

export async function handle(action: () => Promise<unknown>) {
	try {
		return Response.json(await action());
	} catch (error) {
		if (error instanceof ZodError || error instanceof AppError)
			getAppLogger("api").warning("API request rejected", {
				code: error instanceof AppError ? error.code : "VALIDATION",
			});
		if (error instanceof ZodError)
			return Response.json(
				{
					error: {
						code: "VALIDATION",
						message: "Invalid request",
						details: error.flatten(),
					},
				},
				{ status: 422 },
			);
		if (error instanceof AppError)
			return Response.json(
				{
					error: {
						code: error.code,
						message: error.message,
						details: error.details,
					},
				},
				{ status: errorStatus[error.code] },
			);
		reportError(error, { surface: "rest", handled: true });
		return Response.json(
			{ error: { code: "INTERNAL", message: "An unexpected error occurred" } },
			{ status: 500 },
		);
	}
}

function compilePath(path: string) {
	const names: string[] = [];
	const expression = path
		.split("/")
		.map((part) => {
			if (!part.startsWith(":"))
				return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			names.push(part.slice(1));
			return "([^/]+)";
		})
		.join("/");
	return { names, regex: new RegExp(`^${expression}$`) };
}

const routes = operations.flatMap((operation) => {
	const canonical = compilePath(operation.path);
	const legacy = compilePath(operation.path.replace(/^\/v1/, ""));
	const preset =
		"preset" in operation && operation.preset
			? compilePath(operation.preset.legacyPath)
			: null;
	return [
		{ operation, ...canonical, surface: "rest" as const },
		...(operation.path.startsWith("/v1/")
			? [{ operation, ...legacy, surface: "rest" as const }]
			: []),
		...(preset ? [{ operation, ...preset, surface: "shortcut" as const }] : []),
	];
});

function matchRoute(method: string, path: string) {
	for (const route of routes) {
		if (route.operation.method !== method) continue;
		const match = route.regex.exec(path);
		if (!match) continue;
		return {
			...route,
			params: Object.fromEntries(
				route.names.map((name, index) => [
					name,
					decodeURIComponent(match[index + 1] ?? ""),
				]),
			),
		};
	}
	return null;
}

function queryInput(url: URL) {
	const input: Record<string, string | string[]> = {};
	for (const key of new Set(url.searchParams.keys())) {
		const values = url.searchParams.getAll(key);
		input[key] = values.length === 1 ? values[0] : values;
	}
	return input;
}

async function requestInput(request: Request, operation: Operation, url: URL) {
	if (operation.method === "GET") return queryInput(url);
	if (!request.body) return {};
	// Node's HTTP adapter can supply a stream even for a bodyless DELETE/POST.
	const text = await request.text();
	if (!text) return {};
	if (!request.headers.get("content-type")?.includes("application/json"))
		throw new AppError("VALIDATION", "Expected a JSON request body");
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new AppError("VALIDATION", "Malformed JSON request body");
	}
}

function stableValue(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, item]) => [key, stableValue(item)]),
		);
	return value;
}

const stableJson = (value: unknown) => JSON.stringify(stableValue(value));

/**
 * API keys carry a permission set in Better Auth's `{ resource: actions[] }`
 * shape — the same vocabulary as group roles (#/lib/permissions) — and every
 * operation declares the one action it needs as `resource:action`. Keys
 * created before scopes existed have no stored permissions and keep full
 * access, so old integrations don't break.
 */
export function keyAllows(ctx: Ctx, operation: Operation) {
	if (!ctx.apiKeyId || operation.scope === "public") return true;
	if (!ctx.apiKeyPermissions) return true;
	const [resource, action] = operation.scope.split(":");
	return role(ctx.apiKeyPermissions).authorize({ [resource]: [action] })
		.success;
}

export function enforceOperationScope(ctx: Ctx, operation: Operation) {
	if (!keyAllows(ctx, operation))
		throw new AppError("FORBIDDEN", `API key lacks ${operation.scope}`);
}

async function idempotentExecution(
	request: Request,
	ctx: Ctx,
	operation: Operation,
	input: unknown,
	run: () => Promise<unknown>,
) {
	if (!("idempotent" in operation) || !operation.idempotent) return run();
	const key = request.headers.get("idempotency-key")?.trim();
	if (!key) return run();
	if (key.length > 200)
		throw new AppError("VALIDATION", "Idempotency-Key is too long");
	const requestHash = createHash("sha256")
		.update(stableJson(input))
		.digest("hex");
	const identity = and(
		eq(idempotencyKey.key, key),
		eq(idempotencyKey.userId, ctx.user.id),
		eq(idempotencyKey.operation, operation.name),
	);
	const inserted = await ctx.db
		.insert(idempotencyKey)
		.values({
			key,
			userId: ctx.user.id,
			operation: operation.name,
			requestHash,
			createdAt: new Date(),
		})
		.onConflictDoNothing()
		.returning({ key: idempotencyKey.key });
	if (!inserted.length) {
		const existing = await ctx.db.query.idempotencyKey.findFirst({
			where: identity,
		});
		if (!existing)
			throw new AppError(
				"CONFLICT",
				"Idempotent request is being acquired; retry shortly",
			);
		if (existing.requestHash !== requestHash)
			throw new AppError(
				"CONFLICT",
				"Idempotency-Key was already used with different input",
			);
		if (existing.responseJson !== null)
			return JSON.parse(existing.responseJson);
		throw new AppError(
			"CONFLICT",
			"Idempotent request is in progress; use a new key if the original request did not complete",
		);
	}
	let result: unknown;
	try {
		result = await run();
	} catch (error) {
		await ctx.db
			.delete(idempotencyKey)
			.where(and(identity, eq(idempotencyKey.requestHash, requestHash)));
		throw error;
	}
	try {
		await ctx.db
			.update(idempotencyKey)
			.set({ responseJson: stableJson(result) })
			.where(and(identity, eq(idempotencyKey.requestHash, requestHash)));
	} catch (error) {
		reportError(error, {
			surface: "rest",
			operation: operation.name,
			phase: "idempotency_response_persistence",
		});
	}
	return result;
}

function reportResponse(result: unknown) {
	if (!result || typeof result !== "object" || !("content" in result))
		return null;
	const report = result as {
		content: string;
		contentType: string;
		encoding: "utf8" | "base64";
		filename: string;
	};
	const body =
		report.encoding === "base64"
			? Buffer.from(report.content, "base64")
			: report.content;
	return new Response(body, {
		headers: {
			"Content-Type": report.contentType,
			"Content-Disposition": `attachment; filename="${report.filename.replace(/["\\]/g, "")}"`,
			"Cache-Control": "private, no-store",
		},
	});
}

export async function dispatchApi(request: Request, splat: string) {
	const path = `/${splat.replace(/^\/+|\/+$/g, "")}`;
	const url = new URL(request.url);
	const origin = request.headers.get("origin");
	if (
		request.method !== "GET" &&
		request.method !== "HEAD" &&
		origin &&
		origin !== url.origin &&
		!request.headers.get("x-api-key") &&
		!request.headers.get("authorization")
	)
		return handle(() =>
			Promise.reject(new AppError("FORBIDDEN", "Invalid request origin")),
		);
	if (path === "/openapi.json" && request.method === "GET")
		return Response.json(openApiDocument(url.origin));
	if (path === "/jobs/run") return runJobsRequest(request);
	const webResponse = await dispatchWebApi(request, path);
	if (webResponse) return webResponse;
	const route = matchRoute(request.method, path);
	if (!route)
		return handle(() =>
			Promise.reject(new AppError("NOT_FOUND", "API endpoint not found")),
		);

	const response = await handle(async () => {
		const raw = await requestInput(request, route.operation, url);
		const merged = {
			...(raw && typeof raw === "object" ? raw : {}),
			...route.params,
		};
		if ("auth" in route.operation && route.operation.auth === false)
			return invokeOperation(route.operation, null, merged);
		const ctx = await buildContext(request);
		enforceOperationScope(ctx, route.operation);
		const parsed = route.operation.input.parse(merged);
		return idempotentExecution(request, ctx, route.operation, parsed, () =>
			executeOperation(route.operation, ctx, parsed, route.surface),
		);
	});

	if (response.ok && route.operation.name === "expense.report") {
		const result = await response.clone().json();
		return reportResponse(result) ?? response;
	}
	if (route.surface === "shortcut" && !response.ok) {
		const body = (await response.json()) as { error: { message: string } };
		return Response.json(
			{ ...body, message: `Not logged: ${body.error.message}` },
			{ status: response.status },
		);
	}
	return cacheResponse(response, request.method === "GET");
}

function cacheResponse(response: Response, cacheable: boolean) {
	const headers = new Headers(response.headers);
	headers.set(
		"Cache-Control",
		cacheable && response.ok ? "private, max-age=5" : "private, no-store",
	);
	if (cacheable && response.ok)
		headers.append("Vary", "Cookie, Authorization, x-api-key");
	return new Response(response.body, { status: response.status, headers });
}

async function dispatchWebApi(request: Request, path: string) {
	const method = request.method;
	const json = async () => {
		if (!request.headers.get("content-type")?.includes("application/json"))
			throw new AppError("VALIDATION", "Expected a JSON request body");
		try {
			return (await request.json()) as unknown;
		} catch {
			throw new AppError("VALIDATION", "Malformed JSON request body");
		}
	};
	// The app's own pages and the profile: a browser session, or a key the
	// owner explicitly opted into full account access.
	const cookieContext = async () => {
		if (presentedApiKey(request.headers)) {
			const ctx = await buildContext(request);
			if (canImpersonate(ctx.apiKeyPermissions)) return ctx;
		} else if (!request.headers.get("authorization"))
			return buildContext(request);
		throw new AppError(
			"FORBIDDEN",
			"This endpoint needs a session cookie or a full account access key",
		);
	};
	const route = async (action: () => Promise<unknown>, cacheable = false) =>
		cacheResponse(await handle(action), cacheable);
	const measuredRead = (name: string, action: (ctx: Ctx) => Promise<unknown>) =>
		route(async () => {
			const ctx = await cookieContext();
			return measuredOperation(ctx, name, "web", () => action(ctx));
		}, true);
	if (path === "/v1/session" && method === "GET")
		return route(() => webApi.session(request));
	if (path === "/v1/legal" && method === "GET")
		return cacheResponse(Response.json(webApi.legalInfo()), true);
	if (path === "/v1/site" && method === "GET")
		return cacheResponse(Response.json(webApi.siteInfo()), true);
	if (path === "/v1/health" && method === "GET")
		return cacheResponse(Response.json({ status: "ok" }), false);
	if (path === "/v1/pending-verification" && method === "GET")
		return route(() => webApi.pendingVerification(request));
	if (path === "/v1/pending-verification/send" && method === "POST")
		return route(() => webApi.sendPendingVerification(request));
	if (path === "/v1/app/dashboard" && method === "GET")
		return measuredRead("app.dashboard", webApi.dashboard);
	if (path === "/v1/app/composer" && method === "GET")
		return measuredRead("app.composer", webApi.composer);
	if (path === "/v1/app/group-directory" && method === "GET")
		return measuredRead("app.groupDirectory", webApi.groupDirectory);
	const groupRead = path.match(
		/^\/v1\/app\/groups\/([^/]+)\/(context|financial-summary|settings)$/,
	);
	if (groupRead && method === "GET") {
		const action =
			groupRead[2] === "context"
				? webApi.groupContext
				: groupRead[2] === "financial-summary"
					? webApi.groupSummary
					: webApi.groupSettings;
		return measuredRead(`app.group.${groupRead[2]}`, (ctx) =>
			action(ctx, decodeURIComponent(groupRead[1])),
		);
	}
	const page = path.match(/^\/v1\/app\/groups\/([^/]+)\/page$/);
	if (page && method === "GET")
		return measuredRead("app.groupPage", (ctx) =>
			webApi.groupPage(ctx, decodeURIComponent(page[1])),
		);
	if (path === "/v1/me/profile" && method === "PATCH")
		return route(async () =>
			webApi.profile(await cookieContext(), await json()),
		);
	if (path === "/v1/me/api-keys" && method === "GET")
		return route(() => webApi.listApiKeys(request));
	if (path === "/v1/me/api-keys" && method === "POST")
		return route(async () => webApi.createApiKey(request, await json()));
	const key = path.match(/^\/v1\/me\/api-keys\/([^/]+)$/);
	if (key && method === "DELETE")
		return route(() =>
			webApi.deleteApiKey(request, decodeURIComponent(key[1])),
		);
	return null;
}
