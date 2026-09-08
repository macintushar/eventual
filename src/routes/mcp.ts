import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { z } from "zod";

import { buildContext, type Ctx } from "#/server/context";
import { AppError, errorStatus } from "#/server/errors";
import {
	createExpenseSchema,
	groupIdSchema,
	pageSchema,
} from "#/server/schemas";
import {
	createExpense,
	getBalances,
	listExpenses,
	listGroups,
} from "#/server/services/app";

// `createExpenseSchema.date` is `z.coerce.date()`, which cannot be rendered as
// JSON Schema — advertising it directly makes `tools/list` fail. Expose an ISO
// string to clients and let `createExpenseSchema` coerce it back to a Date.
const createExpenseToolShape = {
	...createExpenseSchema.shape,
	date: z.iso
		.datetime()
		.describe("ISO 8601 date-time, e.g. 2026-09-05T00:00:00Z"),
};

const text = (value: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function createMcpServer(ctx: Ctx) {
	const server = new McpServer({ name: "eventual", version: "1.0.0" });
	server.registerTool(
		"listGroups",
		{ description: "List the signed-in user's groups", inputSchema: {} },
		async () => text(await listGroups(ctx)),
	);
	server.registerTool(
		"listExpenses",
		{ description: "List expenses in a group", inputSchema: pageSchema.shape },
		async (input) => text(await listExpenses(ctx, input)),
	);
	server.registerTool(
		"createExpense",
		{
			description: "Create and split an expense",
			inputSchema: createExpenseToolShape,
		},
		async (input) =>
			text(await createExpense(ctx, createExpenseSchema.parse(input))),
	);
	server.registerTool(
		"getBalances",
		{
			description: "Get member balances and simplified transfers",
			inputSchema: groupIdSchema.shape,
		},
		async (input) => text(await getBalances(ctx, input)),
	);
	return server;
}

async function handleMcp(request: Request) {
	let ctx: Ctx;
	try {
		ctx = await buildContext(request);
	} catch (error) {
		if (error instanceof AppError)
			return Response.json(
				{
					jsonrpc: "2.0",
					id: null,
					error: { code: -32001, message: error.message },
				},
				{ status: errorStatus[error.code] },
			);
		throw error;
	}
	const server = createMcpServer(ctx);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		await server.close();
	}
}

export const Route = createFileRoute("/mcp")({
	server: {
		handlers: {
			POST: ({ request }) => handleMcp(request),
		},
	},
});
