import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { auth } from "#/lib/auth";
import { AppError } from "#/server/errors";

export type ApiKeySummary = {
	id: string;
	name: string | null;
	start: string | null;
	enabled: boolean;
	expiresAt: string | null;
	lastRequest: string | null;
	createdAt: string;
};

function toIso(value: Date | string | null | undefined) {
	if (!value) return null;
	return value instanceof Date
		? value.toISOString()
		: new Date(value).toISOString();
}

function summarize(key: {
	id: string;
	name: string | null;
	start: string | null;
	enabled: boolean;
	expiresAt: Date | string | null;
	lastRequest: Date | string | null;
	createdAt: Date | string;
}): ApiKeySummary {
	return {
		id: key.id,
		name: key.name,
		start: key.start,
		enabled: key.enabled,
		expiresAt: toIso(key.expiresAt),
		lastRequest: toIso(key.lastRequest),
		createdAt: toIso(key.createdAt) ?? new Date().toISOString(),
	};
}

function fail(error: unknown, fallback: string): never {
	throw new AppError(
		"VALIDATION",
		error instanceof Error && error.message ? error.message : fallback,
	);
}

async function cookieSessionHeaders() {
	const headers = getRequest().headers;
	if (headers.get("x-api-key"))
		throw new AppError(
			"FORBIDDEN",
			"API keys cannot be managed with an API key",
		);
	const session = await auth.api.getSession({ headers });
	if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
	return headers;
}

export const listApiKeysFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const headers = await cookieSessionHeaders();
		try {
			const result = await auth.api.listApiKeys({
				headers,
				query: { sortBy: "createdAt", sortDirection: "desc" },
			});
			return result.apiKeys.map(summarize);
		} catch (error) {
			fail(error, "Could not load API keys");
		}
	},
);

export const createApiKeyFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			name: z.string().trim().min(1).max(64),
			expiresIn: z.number().int().positive().nullable(),
		}),
	)
	.handler(async ({ data }) => {
		const headers = await cookieSessionHeaders();
		try {
			const created = await auth.api.createApiKey({
				headers,
				body: {
					name: data.name,
					...(data.expiresIn ? { expiresIn: data.expiresIn } : {}),
				},
			});
			return { key: created.key, record: summarize(created) };
		} catch (error) {
			fail(error, "Could not create API key");
		}
	});

export const deleteApiKeyFn = createServerFn({ method: "POST" })
	.validator(z.object({ keyId: z.string().min(1) }))
	.handler(async ({ data }) => {
		const headers = await cookieSessionHeaders();
		try {
			await auth.api.deleteApiKey({
				headers,
				body: { keyId: data.keyId },
			});
			return { success: true as const };
		} catch (error) {
			fail(error, "Could not revoke API key");
		}
	});
