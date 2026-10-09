import { type APIResponse, expect, test } from "@playwright/test";

type HistoryPage = { items: { id: string }[]; nextCursor: string | null };

const histories = [
	["/api/v2/groups/G/expenses", 96],
	["/api/v2/groups/G/settlements", 60],
	["/api/v1/groups/G/activity", 60],
	["/api/v1/me/activity", 60],
] as const;

for (const [path, seeded] of histories) {
	test(`authenticated traversal: ${path}`, async ({ request }) => {
		/*
		 * Walk to exhaustion rather than a fixed number of pages. The seeded
		 * count is a floor, not a total: activity feeds grow when another spec
		 * creates groups first, and a hardcoded page count turned that into a
		 * failure here. What must hold is that every page is full, ids never
		 * repeat, the walk terminates, and the seeded rows are all reached.
		 */
		const ids: string[] = [];
		let cursor: string | null = null;
		let pages = 0;
		do {
			const response: APIResponse = await request.get(path, {
				params: { limit: 12, ...(cursor ? { cursor } : {}) },
			});
			expect(response.status()).toBe(200);
			expect(response.headers()["cache-control"]).toBe("private, max-age=5");
			expect(response.headers().vary).toContain("Cookie");
			const body: HistoryPage = await response.json();
			const next: string | null = body.nextCursor;
			// A page that reports a cursor must be full; the last one need not be.
			expect(body.items.length, `page ${pages}`).toBe(
				next ? 12 : body.items.length,
			);
			if (!next) expect(body.items.length).toBeLessThanOrEqual(12);
			ids.push(...body.items.map((item: { id: string }) => item.id));
			cursor = next;
			pages++;
			expect(pages, "traversal did not terminate").toBeLessThan(200);
		} while (cursor);

		// No id twice: a broken seek would loop over rows it already returned.
		expect(new Set(ids).size, "ids repeated across pages").toBe(ids.length);
		expect(ids.length).toBeGreaterThanOrEqual(seeded);
		expect(ids.length % 12 === 0 || ids.length < seeded + 12).toBe(true);
	});
}

test("HTTP validation rejects bad limits, cursors and query-bound cursor reuse", async ({
	request,
}) => {
	for (const [path] of histories) {
		for (const params of [
			{ limit: "0" },
			{ limit: "101" },
			{ cursor: "broken" },
		] as Record<string, string>[]) {
			const response = await request.get(path, { params });
			expect(response.status(), `${path}: ${JSON.stringify(params)}`).toBe(422);
			expect((await response.json()).error.code).toBe("VALIDATION");
			expect(response.headers()["cache-control"]).toBe("private, no-store");
		}
	}
	const first = await (await request.get(histories[0][0])).json();
	for (const params of [
		{ search: "meal" },
		{ sortBy: "category" },
		{ sortDirection: "asc" },
		{ currency: "USD" },
	] as Record<string, string>[]) {
		expect(
			(
				await request.get(histories[0][0], {
					params: { ...params, cursor: first.nextCursor },
				})
			).status(),
		).toBe(422);
	}
	expect(
		(
			await request.get("/api/v2/groups/other/expenses", {
				params: { cursor: first.nextCursor },
			})
		).status(),
	).toBe(422);
});

test("all expense sorts/filter combinations traverse the same set as v1", async ({
	request,
}) => {
	for (const sortBy of [
		"date",
		"description",
		"payer",
		"category",
		"amountMinor",
	]) {
		for (const sortDirection of ["asc", "desc"]) {
			const params = { sortBy, sortDirection, currency: "INR" };
			const legacy = await (
				await request.get("/api/v1/groups/G/expenses", {
					params: { ...params, limit: 100 },
				})
			).json();
			const ids: string[] = [];
			let cursor: string | null = null;
			do {
				const response: APIResponse = await request.get(histories[0][0], {
					params: { ...params, limit: 13, ...(cursor ? { cursor } : {}) },
				});
				expect(response.status()).toBe(200);
				const body: HistoryPage = await response.json();
				expect(body.items[0]).not.toHaveProperty("shares");
				ids.push(...body.items.map((item: { id: string }) => item.id));
				cursor = body.nextCursor;
				expect(ids.length).toBeLessThanOrEqual(96);
			} while (cursor);
			expect(ids).toEqual(legacy.items.map((item: { id: string }) => item.id));
		}
	}
});

test("new group reads enforce authentication and membership", async ({
	playwright,
	baseURL,
}) => {
	const anonymous = await playwright.request.newContext({
		baseURL,
		storageState: { cookies: [], origins: [] },
	});
	const outsider = await playwright.request.newContext({
		baseURL,
		storageState: { cookies: [], origins: [] },
	});
	try {
		expect(
			(
				await outsider.post("/api/auth/sign-in/email", {
					data: {
						email: "outsider@pagination.invalid",
						password: "pagination-test-password",
					},
				})
			).ok(),
		).toBeTruthy();
		for (const path of [
			...histories.slice(0, 3).map(([path]) => path),
			...["context", "financial-summary", "settings"].map(
				(resource) => `/api/v1/app/groups/G/${resource}`,
			),
		]) {
			expect((await anonymous.get(path)).status(), path).toBe(401);
			expect((await outsider.get(path)).status(), path).toBe(403);
		}
		expect(
			(await (await outsider.get("/api/v1/me/activity")).json()).items,
		).toEqual([]);
	} finally {
		await anonymous.dispose();
		await outsider.dispose();
	}
});

test("split web reads preserve aggregate values and legacy settlement contract", async ({
	request,
}) => {
	const get = async (path: string) => {
		const response = await request.get(path);
		expect(response.status(), path).toBe(200);
		return response.json();
	};
	const legacy = await get("/api/v1/app/groups/G/page");
	const context = await get("/api/v1/app/groups/G/context");
	const summary = await get("/api/v1/app/groups/G/financial-summary");
	expect(context.group).toEqual(legacy.group);
	expect(context).not.toHaveProperty("expenses");
	expect(summary.balances).toEqual(legacy.balances);
	expect(summary.paymentIntents).toEqual(legacy.paymentIntents);
	expect(await get("/api/v1/app/groups/G/settings")).toEqual({
		reminders: [],
		categoryRules: [],
	});
	expect((await get("/api/v1/app/group-directory")).groups).toHaveLength(2);
	const settlements = await get("/api/v1/groups/G/settlements");
	expect(Array.isArray(settlements)).toBeTruthy();
	expect(settlements).toHaveLength(60);
	expect(settlements[0]).toHaveProperty("allocations");
	const compact = await get("/api/v2/groups/G/settlements");
	expect(compact.items[0]).not.toHaveProperty("allocations");
	expect(Object.keys(compact.items[0].from).sort()).toEqual(["id", "name"]);
});

test("expense writes change authoritative summaries and delete returns the affected group", async ({
	request,
}) => {
	const path = "/api/v1/app/groups/other/financial-summary";
	const before = await (await request.get(path)).json();
	const created = await request.post("/api/v1/groups/other/expenses", {
		data: {
			description: "Integration expense",
			amountMinor: 1000,
			currency: "USD",
			date: "2026-09-01",
			paidByUserId: "A",
			splitMethod: "even",
			participants: [
				{ userId: "A", input: null },
				{ userId: "B", input: null },
			],
		},
	});
	expect(created.ok(), await created.text()).toBeTruthy();
	const expense = await created.json();
	try {
		const after = await (await request.get(path)).json();
		expect(after.balances).not.toEqual(before.balances);
		const listed = await (
			await request.get("/api/v2/groups/other/expenses")
		).json();
		expect(listed.items.map((item: { id: string }) => item.id)).toContain(
			expense.id,
		);
	} finally {
		const deleted = await request.delete(`/api/v1/expenses/${expense.id}`);
		expect(deleted.ok(), await deleted.text()).toBeTruthy();
		expect((await deleted.json()).groupId).toBe("other");
	}
	expect(await (await request.get(path)).json()).toEqual(before);
});
