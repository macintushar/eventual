import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as Sentry from "@sentry/tanstackstart-react";
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
import { captureEvent, type McpToolName } from "#/server/telemetry";

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

const metricMethods = new Set([
	"initialize",
	"notifications/initialized",
	"ping",
	"tools/call",
	"tools/list",
]);

function metricMethod(value: unknown) {
	if (typeof value !== "string") return "invalid";
	return metricMethods.has(value) ? value : "other";
}

async function measuredTool<Result>(
	ctx: Ctx,
	toolName: McpToolName,
	run: () => Promise<Result>,
) {
	const startedAt = performance.now();
	try {
		const result = await run();
		captureEvent({
			event: "mcp_tool_called",
			distinctId: ctx.user.id,
			properties: {
				tool_name: toolName,
				success: true,
				duration_ms: Math.round(performance.now() - startedAt),
			},
		});
		return result;
	} catch (error) {
		captureEvent({
			event: "mcp_tool_called",
			distinctId: ctx.user.id,
			properties: {
				tool_name: toolName,
				success: false,
				duration_ms: Math.round(performance.now() - startedAt),
			},
		});
		throw error;
	}
}

function createMcpServer(ctx: Ctx) {
	const server = Sentry.wrapMcpServerWithSentry(
		new McpServer({ name: "eventual", version: "1.0.0" }),
		// Expense inputs and tool results must never leave the application.
		{ recordInputs: false, recordOutputs: false },
	);
	server.registerTool(
		"listGroups",
		{ description: "List the signed-in user's groups", inputSchema: {} },
		async () =>
			measuredTool(ctx, "listGroups", async () => text(await listGroups(ctx))),
	);
	server.registerTool(
		"listExpenses",
		{ description: "List expenses in a group", inputSchema: pageSchema.shape },
		async (input) =>
			measuredTool(ctx, "listExpenses", async () =>
				text(await listExpenses(ctx, input)),
			),
	);
	server.registerTool(
		"createExpense",
		{
			description:
				"Create and split an expense in its original currency. amountMinor uses that currency's smallest unit; no exchange conversion is performed.",
			inputSchema: createExpenseToolShape,
		},
		async (input) =>
			measuredTool(ctx, "createExpense", async () =>
				text(await createExpense(ctx, createExpenseSchema.parse(input))),
			),
	);
	server.registerTool(
		"getBalances",
		{
			description:
				"Get member balances and simplified transfers, separately for each currency. Every balance and transfer includes its currency code.",
			inputSchema: groupIdSchema.shape,
		},
		async (input) =>
			measuredTool(ctx, "getBalances", async () =>
				text(await getBalances(ctx, input)),
			),
	);
	return server;
}

async function handleMcp(request: Request) {
	const startedAt = performance.now();
	const method = await request
		.clone()
		.json()
		.then((body: unknown) =>
			typeof body === "object" && body !== null && "method" in body
				? metricMethod(body.method)
				: "invalid",
		)
		.catch(() => "invalid");
	let ctx: Ctx;
	try {
		ctx = await buildContext(request);
	} catch (error) {
		captureEvent({
			event: "mcp_request_completed",
			distinctId: "anonymous:mcp",
			anonymous: true,
			properties: {
				method,
				success: false,
				authenticated: false,
				duration_ms: Math.round(performance.now() - startedAt),
			},
		});
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
		const response = await transport.handleRequest(request);
		captureEvent({
			event: "mcp_request_completed",
			distinctId: ctx.user.id,
			properties: {
				method,
				success: response.ok,
				authenticated: true,
				duration_ms: Math.round(performance.now() - startedAt),
			},
		});
		return response;
	} catch (error) {
		captureEvent({
			event: "mcp_request_completed",
			distinctId: ctx.user.id,
			properties: {
				method,
				success: false,
				authenticated: true,
				duration_ms: Math.round(performance.now() - startedAt),
			},
		});
		throw error;
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
