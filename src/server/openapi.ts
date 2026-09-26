import { z } from "zod";

import { operations } from "#/server/operations";

const jsonSchema = (schema: z.ZodType) =>
	z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" });

export function openApiDocument(origin?: string) {
	const paths: Record<string, Record<string, unknown>> = {};
	for (const operation of operations) {
		const path = operation.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
		const pathParameters = [
			...operation.path.matchAll(/:([A-Za-z0-9_]+)/g),
		].map(([, name]) => ({
			name,
			in: "path",
			required: true,
			schema: { type: "string" },
		}));
		const request = jsonSchema(operation.input);
		const responseContent =
			operation.name === "expense.report"
				? {
						"text/csv": { schema: { type: "string" } },
						"application/pdf": {
							schema: { type: "string", format: "binary" },
						},
					}
				: { "application/json": { schema: jsonSchema(operation.output) } };
		const entry: Record<string, unknown> = {
			operationId: operation.name,
			tags: [operation.name.split(".")[0]],
			security:
				"auth" in operation && operation.auth === false
					? []
					: [{ cookieAuth: [] }, { bearerAuth: [] }, { apiKey: [] }],
			parameters: pathParameters,
			responses: {
				"200": {
					description: "Successful response",
					content: responseContent,
				},
				"4XX": {
					description: "Request error",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: { error: { type: "object" } },
							},
						},
					},
				},
			},
		};
		if (operation.method === "GET") {
			entry.parameters = [
				...pathParameters,
				{
					name: "input",
					in: "query",
					required: false,
					description:
						"Fields from the operation input schema are accepted as query parameters.",
					schema: request,
				},
			];
		} else {
			entry.requestBody = {
				required: operation.method !== "DELETE",
				content: { "application/json": { schema: request } },
			};
		}
		paths[path] ??= {};
		paths[path][operation.method.toLowerCase()] = entry;
	}
	const webEndpoints = [
		["/v1/health", "get", "health", true],
		["/v1/site", "get", "site.get", true],
		["/v1/legal", "get", "legal.get", true],
		["/v1/session", "get", "session.get", true],
		["/v1/pending-verification", "get", "verification.pending", true],
		["/v1/pending-verification/send", "post", "verification.send", true],
		["/v1/app/dashboard", "get", "app.dashboard", false],
		["/v1/app/composer", "get", "app.composer", false],
		["/v1/app/groups/{groupId}/page", "get", "app.groupPage", false],
		["/v1/me/profile", "patch", "profile.update", false],
		["/v1/me/api-keys", "get", "apiKey.list", false],
		["/v1/me/api-keys", "post", "apiKey.create", false],
		["/v1/me/api-keys/{keyId}", "delete", "apiKey.delete", false],
	] as const;
	for (const [path, method, operationId, publicAccess] of webEndpoints) {
		paths[path] ??= {};
		paths[path][method] = {
			operationId,
			tags: [operationId.split(".")[0]],
			security: publicAccess ? [] : [{ cookieAuth: [] }],
			parameters: [...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => ({
				name,
				in: "path",
				required: true,
				schema: { type: "string" },
			})),
			responses: {
				"200": {
					description: "Successful response",
					content: { "application/json": { schema: {} } },
				},
				"4XX": { description: "Request error" },
			},
		};
	}
	return {
		openapi: "3.1.0",
		info: { title: "Eventual API", version: "1.0.0" },
		servers: [{ url: origin ? `${origin}/api` : "/api" }],
		paths,
		components: {
			securitySchemes: {
				cookieAuth: {
					type: "apiKey",
					in: "cookie",
					name: "better-auth.session_token",
				},
				bearerAuth: { type: "http", scheme: "bearer" },
				apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
			},
		},
	};
}
