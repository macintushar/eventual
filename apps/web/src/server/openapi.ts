import { appEndpoints } from "@eventual/schemas/contract";
import { z } from "zod";
import { errorStatus } from "#/server/errors";
import {
	API_INTRODUCTION,
	SUMMARIES,
	TAG_GROUPS,
	TAGS,
} from "#/server/openapi-meta";
import { operations } from "#/server/operations";

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
	for (const endpoint of appEndpoints) {
		const path = endpoint.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
		const pathNames = [...endpoint.path.matchAll(/:([A-Za-z0-9_]+)/g)].map(
			([, name]) => name,
		);
		const request = jsonSchema(endpoint.input);
		const fields = Object.entries(request.properties ?? {}).filter(
			([name]) => !pathNames.includes(name),
		);
		const required = (name: string) =>
			request.required?.includes(name) ?? false;
		const inQuery =
			endpoint.method === "GET" ||
			("inputIn" in endpoint && endpoint.inputIn === "query");
		paths[path] ??= {};
		paths[path][endpoint.method.toLowerCase()] = {
			operationId: endpoint.name,
			summary: SUMMARIES[endpoint.name],
			tags: [endpoint.name.split(".")[0]],
			security: endpoint.access === "public" ? [] : [{ cookieAuth: [] }],
			parameters: [
				...pathNames.map((name) => ({
					name,
					in: "path",
					required: true,
					schema: { type: "string" },
				})),
				...(inQuery
					? fields.map(([name, schema]) => ({
							name,
							in: "query",
							required: required(name),
							schema,
						}))
					: []),
			],
			...(!inQuery && fields.length
				? {
						requestBody: {
							required: true,
							content: {
								"application/json": {
									schema: {
										...request,
										properties: Object.fromEntries(fields),
										...(request.required && {
											required: request.required.filter(
												(name) => !pathNames.includes(name),
											),
										}),
									},
								},
							},
						},
					}
				: {}),
			responses: {
				"200": {
					description: "Successful response",
					content: {
						"application/json": { schema: jsonSchema(endpoint.output) },
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
