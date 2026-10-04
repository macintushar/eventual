import { z } from "zod";
import { errorStatus } from "#/server/errors";
import {
	API_INTRODUCTION,
	SUMMARIES,
	TAG_GROUPS,
	TAGS,
} from "#/server/openapi-meta";
import { operations } from "#/server/operations";
import { updateProfileSchema } from "#/server/schemas";
import {
	apiKeySummarySchema,
	createApiKeySchema,
	createdApiKeySchema,
	profileSchema,
} from "#/server/schemas/account";

const jsonSchema = (schema: z.ZodType) =>
	z.toJSONSchema(schema, {
		target: "draft-2020-12",
		unrepresentable: "any",
		override: ({ zodSchema, jsonSchema }) => {
			if (zodSchema._zod.def.type === "date") {
				jsonSchema.type = "string";
				jsonSchema.description =
					"Date accepted by the server; use an ISO 8601 string.";
			}
		},
	});

const errorResponse = {
	description: "Request error",
	content: {
		"application/json": { schema: { $ref: "#/components/schemas/Error" } },
	},
};

/**
 * Scoped operations say which API key scope they need, in prose for readers
 * and as `x-required-scope` so clients and tests can check a key against an
 * operation without hard-coding the list.
 */
function describe(mcpDescription: string | undefined, scope: string) {
	if (scope === "public")
		return mcpDescription ? { description: mcpDescription } : {};
	return {
		description: [mcpDescription, `API keys need the \`${scope}\` scope.`]
			.filter(Boolean)
			.join("\n\n"),
		"x-required-scope": scope,
	};
}

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
		const pathNames = new Set(
			pathParameters.map((parameter) => parameter.name),
		);
		// Route parameters are supplied by the URL, not repeated in the body/query.
		request.properties = Object.fromEntries(
			Object.entries(request.properties ?? {}).filter(
				([name]) => !pathNames.has(name),
			),
		);
		request.required = Object.keys(request.properties).filter((name) =>
			operation.input instanceof z.ZodObject
				? !(operation.input.shape as Record<string, z.ZodType>)[
						name
					].isOptional()
				: request.required?.includes(name),
		);
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
			summary: SUMMARIES[operation.name],
			...describe(
				"mcp" in operation && operation.mcp
					? operation.mcp.description
					: undefined,
				operation.scope,
			),
			...("mcp" in operation && operation.mcp
				? { "x-mcp-tool": operation.mcp.tool }
				: {}),
			tags: [operation.name.split(".")[0]],
			security:
				"auth" in operation && operation.auth === false
					? []
					: // API key first: Scalar builds its request samples from the
						// first scheme, and that's what integrations should use.
						[{ apiKey: [] }, { bearerAuth: [] }, { cookieAuth: [] }],
			parameters: pathParameters,
			responses: {
				"200": {
					description: "Successful response",
					content: responseContent,
				},
				"4XX": errorResponse,
			},
		};
		if (operation.method === "GET") {
			entry.parameters = [
				...pathParameters,
				...Object.entries(request.properties).map(([name, schema]) => ({
					name,
					in: "query",
					required: request.required?.includes(name) ?? false,
					schema,
				})),
			];
		} else {
			if (Object.keys(request.properties).length)
				entry.requestBody = {
					required: request.required.length > 0,
					content: { "application/json": { schema: request } },
				};
		}
		paths[path] ??= {};
		paths[path][operation.method.toLowerCase()] = entry;
	}
	// Request and response contracts for the web endpoints that have one worth
	// generating a client from; the rest are app-internal page payloads.
	const webContracts: Partial<
		Record<string, { request?: z.ZodType; response: z.ZodType }>
	> = {
		"profile.update": { request: updateProfileSchema, response: profileSchema },
		"apiKey.list": { response: z.array(apiKeySummarySchema) },
		"apiKey.create": {
			request: createApiKeySchema,
			response: createdApiKeySchema,
		},
		"apiKey.delete": { response: z.object({ success: z.literal(true) }) },
	};
	const webEndpoints = [
		["/v1/health", "get", "health", true],
		["/v1/site", "get", "site.get", true],
		["/v1/legal", "get", "legal.get", true],
		["/v1/session", "get", "session.get", true],
		["/v1/pending-verification", "get", "verification.pending", true],
		["/v1/pending-verification/send", "post", "verification.send", true],
		["/v1/app/dashboard", "get", "app.dashboard", false],
		["/v1/app/composer", "get", "app.composer", false],
		["/v1/app/group-directory", "get", "app.groupDirectory", false],
		["/v1/app/groups/{groupId}/context", "get", "app.groupContext", false],
		[
			"/v1/app/groups/{groupId}/financial-summary",
			"get",
			"app.groupSummary",
			false,
		],
		["/v1/app/groups/{groupId}/settings", "get", "app.groupSettings", false],
		["/v1/app/groups/{groupId}/page", "get", "app.groupPage", false],
		["/v1/me/profile", "patch", "profile.update", false],
		["/v1/me/api-keys", "get", "apiKey.list", false],
		["/v1/me/api-keys", "post", "apiKey.create", false],
		["/v1/me/api-keys/{keyId}", "delete", "apiKey.delete", false],
	] as const;
	for (const [path, method, operationId, publicAccess] of webEndpoints) {
		const contract = webContracts[operationId];
		paths[path] ??= {};
		paths[path][method] = {
			operationId,
			summary: SUMMARIES[operationId],
			tags: [operationId.split(".")[0]],
			security: publicAccess ? [] : [{ cookieAuth: [] }],
			parameters: [...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => ({
				name,
				in: "path",
				required: true,
				schema: { type: "string" },
			})),
			...(contract?.request
				? {
						requestBody: {
							required: true,
							content: {
								"application/json": { schema: jsonSchema(contract.request) },
							},
						},
					}
				: {}),
			responses: {
				"200": {
					description: "Successful response",
					content: {
						"application/json": {
							schema: contract ? jsonSchema(contract.response) : {},
						},
					},
				},
				"4XX": errorResponse,
			},
		};
	}
	return {
		openapi: "3.1.0",
		info: {
			title: "Eventual API",
			version: "1.0.0",
			description: API_INTRODUCTION,
		},
		servers: [{ url: origin ? `${origin}/api` : "/api" }],
		tags: TAG_GROUPS.flatMap((group) =>
			group.tags.map((name) => ({
				name,
				"x-displayName": TAGS[name].displayName,
				description: TAGS[name].description,
			})),
		),
		"x-tagGroups": TAG_GROUPS,
		paths,
		components: {
			schemas: {
				Error: {
					type: "object",
					required: ["error"],
					properties: {
						error: {
							type: "object",
							required: ["code", "message"],
							properties: {
								code: {
									type: "string",
									enum: Object.keys(errorStatus),
								},
								message: { type: "string" },
								details: {
									description:
										"Extra context. Validation errors list the failing fields.",
								},
							},
						},
					},
				},
			},
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
