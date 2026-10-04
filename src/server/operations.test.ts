import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

process.env.TURSO_DATABASE_URL ??= "file:./.operations-test.db";
process.env.BETTER_AUTH_SECRET ??=
	"operations-test-secret-at-least-32-characters";

async function modules() {
	const [
		{ openApiDocument },
		{ mcpWireShape },
		{ mutationSchema, operations },
	] = await Promise.all([
		import("./openapi"),
		import("./mcp-schema"),
		import("./operations"),
	]);
	return { mcpWireShape, openApiDocument, mutationSchema, operations };
}

test("registry has unique versioned routes and idempotent mutations", async () => {
	const { mutationSchema, operations } = await modules();
	const routes = new Set<string>();
	const names = new Set<string>();
	for (const operation of operations) {
		assert.match(operation.path, /^\/v[12]\//);
		assert.equal(names.has(operation.name), false, operation.name);
		names.add(operation.name);
		const route = `${operation.method} ${operation.path}`;
		assert.equal(routes.has(route), false, route);
		routes.add(route);
		if (operation.kind === "mutation") {
			assert.equal("idempotent" in operation && operation.idempotent, true);
			assert.doesNotThrow(() =>
				mutationSchema.parse({
					action: operation.name,
					input: sampleInput(operation.name),
				}),
			);
		}
	}
});

test("OpenAPI projects every registry operation", async () => {
	const { openApiDocument, operations } = await modules();
	const document = openApiDocument("https://eventual.example") as {
		openapi: string;
		paths: Record<
			string,
			Record<
				string,
				{
					operationId: string;
					responses?: Record<string, { content?: Record<string, unknown> }>;
				}
			>
		>;
	};
	assert.equal(document.openapi, "3.1.0");
	for (const operation of operations) {
		const path = operation.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
		assert.equal(
			document.paths[path]?.[operation.method.toLowerCase()]?.operationId,
			operation.name,
		);
	}
	assert.deepEqual(
		Object.keys(
			document.paths["/v1/groups/{groupId}/reports/expenses"]?.get?.responses?.[
				"200"
			]?.content ?? {},
		).sort(),
		["application/pdf", "text/csv"],
	);
});

test("OpenAPI docs name and group every operation", async () => {
	const { openApiDocument } = await modules();
	const document = openApiDocument();
	const paths = document.paths as Record<
		string,
		Record<string, { operationId: string; summary?: string; tags: string[] }>
	>;
	// Scalar drops any tag missing from x-tagGroups, so an ungrouped tag would
	// vanish from /api/docs without an error.
	const grouped = new Set<string>(
		document["x-tagGroups"].flatMap((group) => group.tags),
	);
	for (const methods of Object.values(paths)) {
		for (const entry of Object.values(methods)) {
			assert.ok(entry.summary, `${entry.operationId} needs a summary`);
			for (const tag of entry.tags)
				assert.ok(grouped.has(tag), `${tag} needs a tag group`);
		}
	}
});

test("bodyless mark-paid requests still mark the share paid", async () => {
	const { operations } = await modules();
	const operation = operations.find((item) => item.name === "share.paid");
	assert(operation);
	assert.equal(
		(
			operation.input.parse({ expenseId: "e", userId: "u" }) as {
				paid: boolean;
			}
		).paid,
		true,
	);
});

test("OpenAPI describes flat query parameters and URL-supplied body fields", async () => {
	const { openApiDocument } = await modules();
	const paths = openApiDocument().paths as Record<
		string,
		Record<string, Record<string, unknown>>
	>;
	const page = paths["/v2/groups/{groupId}/expenses"].get;
	const parameters = page.parameters as {
		name: string;
		in: string;
		required: boolean;
		schema: { type?: string; maximum?: number };
	}[];
	assert.equal(parameters.filter((item) => item.name === "groupId").length, 1);
	assert.equal(parameters.find((item) => item.name === "groupId")?.in, "path");
	assert.equal(
		parameters.some((item) => item.name === "input"),
		false,
	);
	assert.equal(parameters.find((item) => item.name === "cursor")?.in, "query");
	assert.equal(
		parameters.find((item) => item.name === "limit")?.required,
		false,
	);
	assert.equal(
		parameters.find((item) => item.name === "limit")?.schema.maximum,
		100,
	);
	assert.equal(
		parameters.find((item) => item.name === "from")?.schema.type,
		"string",
	);
	const create = paths["/v1/groups/{groupId}/expenses"].post.requestBody as {
		required: boolean;
		content: {
			"application/json": {
				schema: { properties: Record<string, unknown>; required: string[] };
			};
		};
	};
	assert.equal(create.required, true);
	assert.equal(
		"groupId" in create.content["application/json"].schema.properties,
		false,
	);
	assert.equal(
		create.content["application/json"].schema.required.includes("groupId"),
		false,
	);
	assert.equal(paths["/v1/expenses/{expenseId}"].delete.requestBody, undefined);
	assert.equal(
		(
			paths["/v1/expenses/{expenseId}/shares/{userId}/paid"].post
				.requestBody as { required: boolean }
		).required,
		false,
	);
});

test("OpenAPI publishes account write contracts", async () => {
	const { openApiDocument } = await modules();
	const paths = openApiDocument().paths as Record<
		string,
		Record<
			string,
			{
				requestBody?: { content: Record<string, { schema: unknown }> };
				responses: Record<
					string,
					{ content?: Record<string, { schema: unknown }> }
				>;
			}
		>
	>;
	for (const [path, method] of [
		["/v1/me/profile", "patch"],
		["/v1/me/api-keys", "post"],
	] as const) {
		const entry = paths[path][method];
		assert.ok(entry.requestBody?.content["application/json"].schema, path);
		assert.notDeepEqual(
			entry.responses["200"].content?.["application/json"].schema,
			{},
		);
	}
});

test("MCP schemas represent optional dates as ISO strings", async () => {
	const { mcpWireShape, operations } = await modules();
	const operation = operations.find((item) => item.name === "expense.list");
	assert(operation);
	const schema = mcpWireShape(operation.input);
	assert.doesNotThrow(() => z.toJSONSchema(z.object(schema)));
	assert.equal(
		(schema.from as z.ZodType).safeParse("2026-09-19T00:00:00.000Z").success,
		true,
	);
});

function sampleInput(name: string): Record<string, unknown> {
	const base = {
		groupId: "g",
		userId: "u",
		expenseId: "e",
		invitationId: "i",
		settlementId: "s",
		templateId: "t",
		ruleId: "r",
	};
	if (name === "group.create") return { name: "Group" };
	if (name === "group.rename") return { groupId: "g", name: "Group" };
	if (name === "group.duplicate") return { groupId: "g" };
	if (name === "member.add") return { groupId: "g", name: "Guest" };
	if (name === "member.role") return { ...base, role: "member" };
	if (name === "member.weight") return { ...base, weight: 2 };
	if (name === "member.merge")
		return { guestUserId: "guest", targetUserId: "user" };
	if (name === "invitation.create")
		return { groupId: "g", email: "a@example.com", role: "member" };
	if (name === "expense.create") return expenseInput({ groupId: "g" });
	if (name === "expense.update") return expenseInput({ expenseId: "e" });
	if (name === "expense.resplit")
		return {
			groupId: "g",
			expenseIds: ["e"],
			splitMethod: "even",
			participants: [{ userId: "u", input: null }],
		};
	if (name === "share.paid") return { expenseId: "e", userId: "u", paid: true };
	if (name === "share.unpaid") return { expenseId: "e", userId: "u" };
	if (name === "settlement.create")
		return { groupId: "g", toUserId: "u", amountMinor: 1, currency: "INR" };
	if (name === "category.create" || name === "category.update")
		return {
			groupId: "g",
			ruleId: "r",
			pattern: "coffee",
			category: "Food",
			priority: 0,
		};
	if (name === "category.delete") return { groupId: "g", ruleId: "r" };
	if (name === "category.apply")
		return { groupId: "g", changes: [{ expenseId: "e", category: "Food" }] };
	if (name === "reminder.schedule")
		return { groupId: "g", userId: "u", dueAt: new Date(Date.now() + 60_000) };
	if (name === "reminder.preferences.update") return { emailReminders: true };
	if (name === "recurring.create")
		return {
			groupId: "g",
			recurrence: "monthly",
			nextRunAt: new Date(),
			active: true,
			payload: expenseInput({}),
		};
	if (name === "recurring.update") return { templateId: "t", active: false };
	if (name === "preset.shortcut.expense")
		return {
			groupId: "g",
			paidByUserId: "u",
			amount: 1,
			description: "Coffee",
		};
	return base;
}

function expenseInput(ids: { groupId?: string; expenseId?: string }) {
	return {
		...ids,
		description: "Coffee",
		amountMinor: 100,
		currency: "INR",
		paidByUserId: "u",
		splitMethod: "even",
		date: new Date(),
		participants: [{ userId: "u", input: null }],
	};
}
