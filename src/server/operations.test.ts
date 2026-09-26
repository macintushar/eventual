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
		assert.match(operation.path, /^\/v1\//);
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
