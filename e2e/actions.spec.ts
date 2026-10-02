import { expect, test } from "@playwright/test";
import {
	account,
	expense,
	group,
	invite,
	json,
	markVerified,
	signUp,
	uniqueEmail,
} from "./support";

test("group lifecycle, invitations, guest membership, and role boundaries", async ({
	browser,
}) => {
	const a = await account(browser);
	const b = await account(browser);
	try {
		const owner = await signUp(
			a.page,
			"Group Owner",
			uniqueEmail("groups-owner"),
		);
		const bEmail = uniqueEmail("groups-member");
		const second = await signUp(b.page, "Group Member", bEmail);
		const g = await group(a.context, "Original name");
		expect(g.members[0]).toMatchObject({ userId: owner.id, role: "owner" });
		await json(
			b.context,
			"PATCH",
			`/groups/${g.id}`,
			{ name: "Not allowed" },
			403,
		);

		const revoked = await invite(a.context, g.id, uniqueEmail("revoked"));
		await json(a.context, "DELETE", `/invitations/${revoked.invitationId}`);
		await json(
			b.context,
			"GET",
			`/invitations/${revoked.invitationId}`,
			undefined,
			404,
		);
		const pending = await invite(a.context, g.id, bEmail);
		await json(
			b.context,
			"POST",
			`/invitations/${pending.invitationId}/accept`,
			{},
			403,
		);
		await markVerified(second.id);
		await json(
			b.context,
			"POST",
			`/invitations/${pending.invitationId}/accept`,
			{},
		);
		expect(
			(await json<any[]>(b.context, "GET", "/me/invitations")).length,
		).toBe(0);
		await json(
			b.context,
			"POST",
			`/groups/${g.id}/invitations`,
			{ email: uniqueEmail("nope") },
			403,
		);

		const guest = await json<any>(
			a.context,
			"POST",
			`/groups/${g.id}/members`,
			{ name: "Cash Guest", weight: 2 },
		);
		expect(guest.member.weight).toBe(2);
		await json(
			b.context,
			"PATCH",
			`/groups/${g.id}/members/${guest.userId}/weight`,
			{ weight: 3 },
			403,
		);
		await json(
			a.context,
			"PATCH",
			`/groups/${g.id}/members/${guest.userId}/weight`,
			{ weight: 3 },
		);
		expect(
			(await json<any[]>(a.context, "GET", `/groups/${g.id}/members`)).find(
				(row) => row.userId === guest.userId,
			).weight,
		).toBe(3);
		await json(
			b.context,
			"PATCH",
			`/groups/${g.id}/members/${owner.id}`,
			{ role: "member" },
			403,
		);
		await json(a.context, "PATCH", `/groups/${g.id}/members/${second.id}`, {
			role: "admin",
		});
		await json(a.context, "PATCH", `/groups/${g.id}/members/${second.id}`, {
			role: "member",
		});
		await json(
			a.context,
			"PATCH",
			`/groups/${g.id}/members/${owner.id}`,
			{ role: "member" },
			409,
		);

		await json(a.context, "PATCH", `/groups/${g.id}`, {
			name: "Renamed group",
		});
		const copy = await json<any>(
			a.context,
			"POST",
			`/groups/${g.id}/duplicate`,
		);
		expect(copy.name).toBe("Renamed group (copy)");
		expect(copy.members).toHaveLength(3);
		expect(
			(await json<any>(a.context, "GET", `/groups/${copy.id}/expenses`)).items,
		).toEqual([]);
		await json(a.context, "POST", `/groups/${g.id}/archive`);
		expect(
			(await json<any>(a.context, "GET", `/groups/${g.id}`)).archivedAt,
		).toBeTruthy();
		await json(a.context, "POST", `/groups/${g.id}/unarchive`);
		await json(b.context, "POST", `/groups/${g.id}/leave`);
		await json(a.context, "DELETE", `/groups/${g.id}/members/${guest.userId}`);
		await json(a.context, "POST", `/groups/${g.id}/leave`, {}, 409);
		await json(a.context, "DELETE", `/groups/${copy.id}`);
		await json(a.context, "DELETE", `/groups/${g.id}`);
		await json(a.context, "GET", `/groups/${g.id}`, undefined, 403);
	} finally {
		await Promise.all([a.context.close(), b.context.close()]);
	}
});

test("split variants, categories, paid locks, reporting, activity and validation", async ({
	browser,
}) => {
	const a = await account(browser);
	const b = await account(browser);
	try {
		const owner = await signUp(
			a.page,
			"Expense Owner",
			uniqueEmail("expense-owner"),
		);
		const bEmail = uniqueEmail("expense-member");
		const member = await signUp(b.page, "Expense Member", bEmail);
		await markVerified(member.id);
		const g = await group(a.context, "Expense checks");
		const pending = await invite(a.context, g.id, bEmail);
		await json(
			b.context,
			"POST",
			`/invitations/${pending.invitationId}/accept`,
			{},
		);
		const base = {
			description: "E2E meal",
			amountMinor: 10001,
			currency: "INR",
			paidByUserId: owner.id,
			date: "2026-09-27",
			participants: [owner.id, member.id].map((userId) => ({
				userId,
				input: null,
			})),
		};
		for (const [splitMethod, inputs] of [
			["even", [null, null]],
			["exact", [5000, 5001]],
			["shares", [1, 2]],
			["percent", [2500, 7500]],
		] as const) {
			const body = {
				...base,
				splitMethod,
				participants: base.participants.map((row, index) => ({
					...row,
					input: inputs[index],
				})),
			};
			const preview = await json<any[]>(
				a.context,
				"POST",
				`/groups/${g.id}/expenses/preview`,
				body,
			);
			expect(preview.reduce((sum, share) => sum + share.amountMinor, 0)).toBe(
				10001,
			);
			const created = await json<any>(
				a.context,
				"POST",
				`/groups/${g.id}/expenses`,
				{ ...body, reviewedShares: preview },
			);
			expect(
				created.shares.reduce(
					(sum: number, share: any) => sum + share.amountMinor,
					0,
				),
			).toBe(10001);
			expect(
				(await json<any>(b.context, "GET", `/expenses/${created.id}`)).id,
			).toBe(created.id);
			await json(a.context, "DELETE", `/expenses/${created.id}`);
		}
		await json(
			a.context,
			"POST",
			`/groups/${g.id}/expenses`,
			{
				...base,
				splitMethod: "exact",
				participants: base.participants.map((row) => ({ ...row, input: 1 })),
			},
			422,
		);
		const rule = await json<any>(
			a.context,
			"POST",
			`/groups/${g.id}/categories`,
			{ pattern: "e2e", category: "Test meals", priority: 10 },
		);
		expect(
			(
				await json<any>(
					a.context,
					"GET",
					`/groups/${g.id}/categories/suggest?description=E2E%20meal`,
				)
			).category,
		).toBe("Test meals");
		await json(
			b.context,
			"PATCH",
			`/groups/${g.id}/categories/${rule.id}`,
			{ pattern: "e2e", category: "Other" },
			403,
		);
		await json(a.context, "PATCH", `/groups/${g.id}/categories/${rule.id}`, {
			pattern: "e2e",
			category: "Meals",
			priority: 11,
		});
		const dinner = await expense(
			a.context,
			g.id,
			owner.id,
			[owner.id, member.id],
			20000,
		);
		const listing = await json<any>(
			b.context,
			"GET",
			`/groups/${g.id}/expenses?search=Shared&sortBy=amountMinor&sortDirection=asc&limit=1`,
		);
		expect(listing.items).toHaveLength(1);
		const report = await a.context.request.get(
			`/api/v1/groups/${g.id}/reports/expenses?format=csv`,
		);
		expect(report.status()).toBe(200);
		expect(report.headers()["content-type"]).toContain("text/csv");
		expect(await report.text()).toContain("Shared INR expense");
		const pdf = await a.context.request.get(
			`/api/v1/groups/${g.id}/reports/expenses?format=pdf`,
		);
		expect(pdf.status()).toBe(200);
		expect(pdf.headers()["content-type"]).toContain("application/pdf");
		expect((await pdf.body())?.subarray(0, 4).toString()).toBe("%PDF");
		await json(
			a.context,
			"POST",
			`/expenses/${dinner.id}/shares/${member.id}/paid`,
		);
		await json(a.context, "DELETE", `/expenses/${dinner.id}`, undefined, 409);
		await json(
			a.context,
			"DELETE",
			`/expenses/${dinner.id}/shares/${member.id}/paid`,
		);
		await json(a.context, "PATCH", `/expenses/${dinner.id}`, {
			...base,
			description: "Changed dinner",
			amountMinor: 20000,
			splitMethod: "even",
		});
		const activity = await json<any>(
			a.context,
			"GET",
			`/groups/${g.id}/activity?limit=10`,
		);
		expect(JSON.stringify(activity)).toContain("expense.updated");
		await json(a.context, "DELETE", `/expenses/${dinner.id}`);
		await json(a.context, "DELETE", `/groups/${g.id}/categories/${rule.id}`);
		expect(
			await json<any[]>(a.context, "GET", `/groups/${g.id}/categories`),
		).toEqual([]);
	} finally {
		await Promise.all([a.context.close(), b.context.close()]);
	}
});

test("MCP tools use the same authenticated groups, expenses and balances", async ({
	browser,
}) => {
	const a = await account(browser);
	try {
		const user = await signUp(a.page, "MCP Owner", uniqueEmail("mcp"));
		const g = await group(a.context, "MCP shared group");
		const key = await json<any>(a.context, "POST", "/me/api-keys", {
			name: "MCP test",
			expiresIn: null,
		});
		const rpc = async (id: number, method: string, params?: unknown) => {
			const response = await a.context.request.post("/mcp", {
				headers: {
					"x-api-key": key.key,
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
				},
				data: { jsonrpc: "2.0", id, method, params },
			});
			expect(response.status(), await response.text()).toBe(200);
			const body = await response.json();
			expect(body.error).toBeUndefined();
			return body.result;
		};
		const tools = await rpc(1, "tools/list");
		expect(tools.tools.map((tool: any) => tool.name)).toEqual(
			expect.arrayContaining([
				"listGroups",
				"listExpenses",
				"createExpense",
				"getBalances",
			]),
		);
		const call = async (id: number, name: string, args: unknown) => {
			const result = await rpc(id, "tools/call", { name, arguments: args });
			expect(result.isError, JSON.stringify(result)).not.toBe(true);
			return JSON.parse(result.content[0].text);
		};
		expect(
			(await call(2, "listGroups", {})).map((row: any) => row.id),
		).toContain(g.id);
		const created = await call(3, "createExpense", {
			groupId: g.id,
			description: "MCP coffee",
			amountMinor: 1200,
			currency: "INR",
			paidByUserId: user.id,
			splitMethod: "even",
			date: "2026-09-27T12:00:00.000Z",
			participants: [{ userId: user.id, input: null }],
		});
		expect(
			(await call(4, "listExpenses", { groupId: g.id })).items.some(
				(row: any) => row.id === created.id,
			),
		).toBe(true);
		expect((await call(5, "getBalances", { groupId: g.id })).transfers).toEqual(
			[],
		);
		await json(a.context, "DELETE", `/me/api-keys/${key.record.id}`);
		const denied = await a.context.request.post("/mcp", {
			headers: {
				"x-api-key": key.key,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			data: { jsonrpc: "2.0", id: 6, method: "tools/list" },
		});
		expect(denied.status()).toBe(401);
	} finally {
		await a.context.close();
	}
});

test("account settings, API keys, shortcut preset, reminders and recurring templates", async ({
	browser,
}) => {
	const a = await account(browser);
	try {
		const owner = await signUp(
			a.page,
			"Automation Owner",
			uniqueEmail("automation"),
		);
		const g = await group(a.context, "Automation checks");
		await json(a.context, "PATCH", "/me/profile", {
			name: "Updated Owner",
			emailReminders: false,
		});
		expect(
			(await json<any>(a.context, "GET", "/app/dashboard")).user.name,
		).toBe("Updated Owner");
		await json(a.context, "PATCH", "/me/reminder-preferences", {
			emailReminders: true,
		});
		expect(
			(await json<any>(a.context, "GET", "/me/reminder-preferences"))
				.emailReminders,
		).toBe(true);
		await json(a.context, "POST", `/groups/${g.id}/reminders`, {
			userId: owner.id,
			dueAt: "2030-01-01T00:00:00.000Z",
		});
		expect(
			await json<any[]>(a.context, "GET", `/groups/${g.id}/reminders`),
		).toHaveLength(1);
		const payload = {
			description: "Monthly rent",
			amountMinor: 5000,
			currency: "INR",
			paidByUserId: owner.id,
			splitMethod: "even",
			participants: [{ userId: owner.id, input: null }],
		};
		const template = await json<any>(
			a.context,
			"POST",
			`/groups/${g.id}/recurring-expenses`,
			{ recurrence: "monthly", nextRunAt: "2030-01-01T00:00:00.000Z", payload },
		);
		expect(
			(
				await json<any[]>(
					a.context,
					"GET",
					`/groups/${g.id}/recurring-expenses`,
				)
			).some((row) => row.id === template.id),
		).toBe(true);
		await json(a.context, "PATCH", `/recurring-expenses/${template.id}`, {
			active: false,
		});
		await json(a.context, "DELETE", `/recurring-expenses/${template.id}`);

		const key = await json<any>(a.context, "POST", "/me/api-keys", {
			name: "E2E key",
			expiresIn: null,
		});
		expect(key.key).toMatch(/^ev_/);
		expect(
			(await json<any[]>(a.context, "GET", "/me/api-keys")).some(
				(row) => row.id === key.record.id,
			),
		).toBe(true);
		const usingKey = await a.context.request.get("/api/v1/groups", {
			headers: { "x-api-key": key.key },
		});
		expect(usingKey.status()).toBe(200);
		expect((await usingKey.json()).map((row: any) => row.id)).toContain(g.id);
		const shortcut = await a.context.request.get("/api/shortcut/groups", {
			headers: { "x-api-key": key.key },
		});
		expect(shortcut.status()).toBe(200);
		expect(await shortcut.json()).toHaveProperty("Automation checks", g.id);
		await json(a.context, "DELETE", `/me/api-keys/${key.record.id}`);
		const revoked = await a.context.request.get("/api/v1/groups", {
			headers: { "x-api-key": key.key },
		});
		expect(revoked.status()).toBe(401);
		const anonymous = await browser.newContext({
			baseURL: "http://127.0.0.1:4173",
		});
		try {
			expect(
				(await anonymous.request.get(`/api/v1/groups/${g.id}`)).status(),
			).toBe(401);
		} finally {
			await anonymous.close();
		}
	} finally {
		await a.context.close();
	}
});

test("idempotency, bulk resplit, guest merge and Shortcut API share persisted state", async ({
	browser,
}) => {
	const a = await account(browser);
	const b = await account(browser);
	try {
		const owner = await signUp(
			a.page,
			"Surface Owner",
			uniqueEmail("surface-owner"),
		);
		await markVerified(owner.id);
		const bEmail = uniqueEmail("surface-member");
		const second = await signUp(b.page, "Surface Member", bEmail);
		await markVerified(second.id);
		const key = `group-${crypto.randomUUID()}`;
		const post = (name: string) =>
			a.context.request.post("/api/v1/groups", {
				headers: { "Idempotency-Key": key, "Content-Type": "application/json" },
				data: { name },
			});
		const initial = await post("Idempotent group");
		expect(initial.status()).toBe(200);
		const g = await initial.json();
		expect((await (await post("Idempotent group")).json()).id).toBe(g.id);
		expect((await post("Different input")).status()).toBe(409);
		expect(
			(await json<any[]>(a.context, "GET", "/groups")).filter(
				(row) => row.id === g.id,
			),
		).toHaveLength(1);

		const pending = await invite(a.context, g.id, bEmail);
		await json(
			b.context,
			"POST",
			`/invitations/${pending.invitationId}/accept`,
			{},
		);
		const saved = await expense(
			a.context,
			g.id,
			owner.id,
			[owner.id, second.id],
			9000,
		);
		const resplit = await json<any>(
			a.context,
			"POST",
			`/groups/${g.id}/expenses/resplit`,
			{
				expenseIds: [saved.id],
				splitMethod: "exact",
				participants: [
					{ userId: owner.id, input: 2000 },
					{ userId: second.id, input: 7000 },
				],
			},
		);
		expect(resplit).toBeTruthy();
		expect(
			(await json<any>(b.context, "GET", `/expenses/${saved.id}`)).shares.find(
				(row: any) => row.userId === second.id,
			).amountMinor,
		).toBe(7000);
		await json(
			b.context,
			"POST",
			`/groups/${g.id}/settlements`,
			{ toUserId: owner.id, currency: "INR", amountMinor: 7001 },
			422,
		);
		expect(
			(await json<any>(b.context, "GET", `/groups/${g.id}/balances`))
				.transfers[0].amountMinor,
		).toBe(7000);
		expect(
			(await json<any>(a.context, "GET", `/groups/${g.id}/payment-intents`))
				.intents[0].amountMinor,
		).toBe(7000);
		expect(
			JSON.stringify(
				await json<any>(b.context, "GET", "/me/activity?limit=10"),
			),
		).toContain("expense.created");

		// Merge requires the target account holder to administer the guest's group.
		const guest = await json<any>(
			a.context,
			"POST",
			`/groups/${g.id}/members`,
			{ name: "Cash only" },
		);
		await json(
			b.context,
			"POST",
			"/members/merge",
			{ guestUserId: guest.userId, targetUserId: second.id },
			403,
		);
		await json(a.context, "POST", "/members/merge", {
			guestUserId: guest.userId,
			targetUserId: owner.id,
		});
		expect(
			(await json<any[]>(a.context, "GET", `/groups/${g.id}/members`)).some(
				(row) => row.userId === guest.userId,
			),
		).toBe(false);

		const apiKey = await json<any>(a.context, "POST", "/me/api-keys", {
			name: "Shortcut flow",
			expiresIn: null,
		});
		const headers = {
			"x-api-key": apiKey.key,
			"Content-Type": "application/json",
		};
		const members = await a.context.request.get(
			`/api/shortcut/groups/${g.id}/members`,
			{ headers },
		);
		expect(members.status()).toBe(200);
		expect(Object.values(await members.json())).toContain(second.id);
		const quick = await a.context.request.post(
			`/api/shortcut/groups/${g.id}/expenses`,
			{
				headers,
				data: { amount: 12.5, currency: "INR", description: "Shortcut coffee" },
			},
		);
		expect(quick.status()).toBe(200);
		expect(
			(
				await json<any>(
					b.context,
					"GET",
					`/groups/${g.id}/expenses?search=Shortcut%20coffee`,
				)
			).items,
		).toHaveLength(1);
		await json(a.context, "DELETE", `/me/api-keys/${apiKey.record.id}`);
	} finally {
		await Promise.all([a.context.close(), b.context.close()]);
	}
});
