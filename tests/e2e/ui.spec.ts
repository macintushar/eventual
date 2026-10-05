import { expect, type Locator, type Page, test } from "@playwright/test";

const expensePath = "/api/v2/groups/G/expenses";
const rows = (page: Page) => page.locator("tbody tr");
const links = (page: Page) => page.locator("tbody a");
const ids = (page: Page) =>
	links(page).evaluateAll((items) =>
		items.map((item) => item.getAttribute("href")),
	);

async function openGroup(page: Page, groupId = "G") {
	// SSR rows are visible before React attaches event handlers. This query is
	// mounted by the expense tab on the client, so wait for it before interacting.
	const mounted = page.waitForResponse((response) =>
		response.url().includes(`/api/v1/groups/${groupId}/recurring-expenses`),
	);
	await page.goto(`/app/groups/${groupId}`);
	await mounted;
}

async function refocusStaleHistory(page: Page) {
	// History becomes stale after one minute. Keep timers running normally.
	await page.clock.setFixedTime(
		new Date((await page.evaluate(() => Date.now())) + 61_000),
	);
	await page.evaluate(() => {
		// Simulate leaving and returning to the tab in headless browsers too.
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "hidden",
		});
		document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
		Reflect.deleteProperty(document, "visibilityState");
		document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
	});
}

test("scroll append keeps rows and position, makes one list request and no summary requests", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/api/")) requests.push(request.url());
	});
	await openGroup(page);
	await expect(rows(page)).toHaveCount(30);
	expect(
		requests.some((url) => {
			// The shell independently loads /me/invitations for its banner; only
			// group-tab requests would violate the lazy-loading contract here.
			const path = new URL(url).pathname;
			return (
				path.includes("/groups/G/") &&
				/\/(settings|settlements|invitations|page)$/.test(path)
			);
		}),
	).toBeFalsy();
	const first = await ids(page);
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(`**${expensePath}?**`, async (route) => {
		if (new URL(route.request().url()).searchParams.has("cursor")) await gate;
		await route.continue();
	});
	requests.length = 0;
	await rows(page).nth(26).scrollIntoViewIfNeeded();
	await expect(page.getByRole("button", { name: /Loading…/ })).toBeDisabled();
	await expect(rows(page)).toHaveCount(30);
	const top = await rows(page)
		.nth(26)
		.evaluate((row) => row.getBoundingClientRect().top);
	release();
	await expect(rows(page)).toHaveCount(60);
	expect((await ids(page)).slice(0, 30)).toEqual(first);
	expect(
		Math.abs(
			(await rows(page)
				.nth(26)
				.evaluate((row) => row.getBoundingClientRect().top)) - top,
		),
	).toBeLessThan(3);
	expect(requests.filter((url) => url.includes(expensePath))).toHaveLength(1);
	expect(
		requests.filter((url) =>
			/financial-summary|\/context|\/composer/.test(url),
		),
	).toEqual([]);
});

test("continuation error preserves rows, stops auto retry, and keyboard Try again recovers", async ({
	page,
}) => {
	let attempts = 0;
	await page.route(`**${expensePath}?**`, async (route) => {
		if (
			new URL(route.request().url()).searchParams.has("cursor") &&
			++attempts === 1
		)
			return route.fulfill({
				status: 422,
				json: {
					error: { code: "VALIDATION", message: "Test continuation failure" },
				},
			});
		await route.continue();
	});
	await openGroup(page);
	await expect(rows(page)).toHaveCount(30);
	const first = await ids(page);
	await page
		.getByRole("button", { name: "Load more", exact: true })
		.scrollIntoViewIfNeeded();
	const retry = page.getByRole("button", { name: "Try again", exact: true });
	await expect(retry).toBeVisible();
	await expect(
		page.getByText("Couldn't load more expenses.", { exact: true }),
	).toBeVisible();
	expect(await ids(page)).toEqual(first);
	expect(attempts).toBe(1);
	await retry.focus();
	await page.keyboard.press("Enter");
	await expect(rows(page)).toHaveCount(60);
	expect(attempts).toBe(2);
	expect((await ids(page)).slice(0, 30)).toEqual(first);
});

test("manual continuation works without IntersectionObserver and ends on the exact final page", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, "IntersectionObserver", { value: undefined });
	});
	await openGroup(page);
	await expect(rows(page)).toHaveCount(30);
	for (const count of [60, 90, 96]) {
		const more = page.getByRole("button", { name: "Load more", exact: true });
		await more.focus();
		await page.keyboard.press("Enter");
		await expect(rows(page)).toHaveCount(count);
	}
	expect(new Set(await ids(page)).size).toBe(96);
	await expect(
		page.getByRole("button", { name: "Load more", exact: true }),
	).toHaveCount(0);
});

test("first-page errors on a new search recover through Try again", async ({
	page,
}) => {
	await openGroup(page);
	let attempts = 0;
	await page.route(`**${expensePath}?**`, async (route) => {
		if (
			new URL(route.request().url()).searchParams.get("search") === "meal 4" &&
			++attempts === 1
		)
			return route.fulfill({
				status: 422,
				json: {
					error: { code: "VALIDATION", message: "Test first-page failure" },
				},
			});
		await route.continue();
	});
	const search = page.getByRole("searchbox", { name: "Search expenses" });
	await search.fill("meal 4");
	await search.press("Enter");
	await expect(
		page.getByText("Couldn't load expenses", { exact: true }),
	).toBeVisible();
	await expect(rows(page)).toHaveCount(0);
	await page.getByRole("button", { name: "Try again", exact: true }).click();
	await expect(rows(page)).toHaveCount(11);
	expect(attempts).toBe(2);
	await expect(
		page.getByRole("button", { name: "Try again", exact: true }),
	).toHaveCount(0);
});

test("search and sorting start new traversals, refocus refreshes an empty search", async ({
	page,
}) => {
	await openGroup(page);
	await expect(rows(page)).toHaveCount(30);
	const search = page.getByRole("searchbox", { name: "Search expenses" });
	await search.fill("meal 3");
	const searched = page.waitForResponse(
		(response) =>
			response.url().includes(expensePath) &&
			new URL(response.url()).searchParams.get("search") === "meal 3",
	);
	await search.press("Enter");
	const response = await searched;
	expect(new URL(response.url()).searchParams.has("cursor")).toBeFalsy();
	const expected = await response.json();
	await expect(rows(page)).toHaveCount(expected.items.length);
	for (const name of await links(page).allTextContents())
		expect(name).toContain("Meal 3");
	const sorted = page.waitForResponse(
		(response) =>
			response.url().includes(expensePath) &&
			new URL(response.url()).searchParams.get("sortBy") === "description",
	);
	await page.getByRole("button", { name: /Description\s*,/ }).click();
	const sortResponse = await sorted;
	expect(new URL(sortResponse.url()).searchParams.has("cursor")).toBeFalsy();
	await expect(
		page.getByRole("columnheader", { name: /Description/ }),
	).toHaveAttribute("aria-sort", "ascending");
	await search.fill("nothing-matches-this");
	await search.press("Enter");
	await expect(page.getByText("No expenses match this search.")).toBeVisible();
	const refreshed = page.waitForResponse(
		(response) =>
			response.url().includes(expensePath) &&
			new URL(response.url()).searchParams.get("search") ===
				"nothing-matches-this",
	);
	await refocusStaleHistory(page);
	expect((await refreshed).status()).toBe(200);
	await search.fill("");
	await search.press("Enter");
	await expect(rows(page)).toHaveCount(30);
});

test("payment and activity tabs load on demand and have complete cursor continuations", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, "IntersectionObserver", { value: undefined });
	});
	await openGroup(page);
	await expect(rows(page)).toHaveCount(30);

	/*
	 * Drain each tab with "Load more" instead of asserting a hardcoded total.
	 * These feeds grow whenever another spec writes to group G first — the api
	 * key suite adds expenses, payments and its own activity — so a fixed
	 * total is only ever right for whichever spec ran first. What must hold is
	 * that each click appends a full page and the walk ends on its own.
	 */
	const drain = async (items: Locator) => {
		const loadMore = page.getByRole("button", {
			name: "Load more",
			exact: true,
		});
		let total = await items.count();
		expect(total).toBe(30);
		for (let clicks = 0; clicks < 200; clicks++) {
			if ((await loadMore.count()) === 0) return total;
			const before = total;
			await loadMore.click();
			await expect
				.poll(() => items.count(), { timeout: 10_000 })
				.toBeGreaterThan(before);
			total = await items.count();
			/*
			 * The last page is the only one allowed to be short. While the
			 * button is still there there is another full page behind it, and
			 * anything less means the cursor dropped rows.
			 */
			if ((await loadMore.count()) > 0)
				expect(total - before, "a full page was promised").toBe(30);
		}
		throw new Error("Load more never went away");
	};

	await page.getByRole("tab", { name: "Balances", exact: true }).click();
	const payments = page.getByText(/^Test payment \d+$/);
	await expect(payments).toHaveCount(30);
	expect(await drain(payments)).toBeGreaterThanOrEqual(60);

	await page.getByRole("tab", { name: "Activity", exact: true }).click();
	const activity = page.locator('[role="tabpanel"] [data-slot="item"]');
	await expect(activity).toHaveCount(30);
	expect(await drain(activity)).toBeGreaterThanOrEqual(60);
});

test("personal activity retains its loaded pages across refocus refresh", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, "IntersectionObserver", { value: undefined });
	});
	await openGroup(page);
	await page.getByRole("link", { name: "Activity", exact: true }).click();
	await expect(page.locator("section ol > li")).toHaveCount(30);
	await page.getByRole("button", { name: "Load more", exact: true }).click();
	await expect(page.locator("section ol > li")).toHaveCount(60);
	const refreshed = page.waitForResponse((response) => {
		const url = new URL(response.url());
		return (
			url.pathname === "/api/v1/me/activity" && url.searchParams.has("cursor")
		);
	});
	await refocusStaleHistory(page);
	expect((await refreshed).status()).toBe(200);
	await expect(page.getByText("Updating", { exact: true })).toHaveCount(0);
	await expect(page.locator("section ol > li")).toHaveCount(60);
});

test("detail/back restores loaded rows and scroll without replaying the history", async ({
	page,
}) => {
	await openGroup(page);
	await expect(rows(page)).toHaveCount(30);
	await rows(page).nth(26).scrollIntoViewIfNeeded();
	await expect(rows(page)).toHaveCount(60);
	await links(page).nth(31).scrollIntoViewIfNeeded();
	const loaded = await ids(page);
	const y = await page.evaluate(() => window.scrollY);
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes(expensePath)) requests.push(request.url());
	});
	await links(page).nth(31).click();
	await expect(page).toHaveURL(/\/expenses\/E/);
	await expect(
		page.getByRole("button", { name: "Edit expense", exact: true }),
	).toBeVisible();
	await page.goBack();
	await expect(rows(page)).toHaveCount(60);
	expect(await ids(page)).toEqual(loaded);
	await expect
		.poll(() => page.evaluate(() => window.scrollY))
		.toBeGreaterThan(y - 5);
	expect(requests).toEqual([]);
});

test("a share mutation refreshes the affected summary and keeps the closed composer idle", async ({
	page,
}) => {
	const created = await page.request.post("/api/v1/groups/other/expenses", {
		data: {
			description: "UI mutation expense",
			amountMinor: 1000,
			currency: "USD",
			date: "2026-09-01",
			paidByUserId: "B",
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
		await openGroup(page, "other");
		// The dock opens directly from cached group context on every viewport.
		await page
			.getByRole("button", { name: "New expense in this group" })
			.click();
		await expect(
			page.getByRole("dialog", { name: "Add an expense" }),
		).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await page
			.getByRole("link", { name: "UI mutation expense", exact: true })
			.click();
		const paid = page.getByRole("checkbox", { name: "Mark Zoe's share paid" });
		await expect(paid).not.toBeChecked();
		const requests: string[] = [];
		page.on("request", (request) => {
			if (request.url().includes("/api/")) requests.push(request.url());
		});
		const summary = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname ===
				"/api/v1/app/groups/other/financial-summary",
		);
		// A Radix checkbox button updates aria-checked asynchronously after the
		// mutation completes; check() would race that update.
		await paid.click();
		await summary;
		await expect(paid).toBeChecked();
		expect(
			requests.filter((url) =>
				new URL(url).pathname.endsWith("/financial-summary"),
			),
		).toHaveLength(1);
		expect(
			requests.filter((url) =>
				/\/composer|\/groups\/G\/|\/settings|\/recurring-expenses/.test(url),
			),
		).toEqual([]);
	} finally {
		// Undo the paid flag before deletion (paid expenses are locked).
		await page.request.delete(`/api/v1/expenses/${expense.id}/shares/A/paid`);
		const deleted = await page.request.delete(`/api/v1/expenses/${expense.id}`);
		expect(deleted.ok(), await deleted.text()).toBeTruthy();
	}
});
