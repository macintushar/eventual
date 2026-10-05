import { expect, type Page, type TestInfo, test } from "@playwright/test";

const unavailable = "Service temporarily unavailable. Please try again.";
const expenses = "/api/v2/groups/G/expenses";

// Hold requests until the loading screenshot is captured; then fail every
// attempt (including React Query's automatic retry) until explicit recovery.
async function mockFailure(
	page: Page,
	matches: (url: URL) => boolean,
	status = 503,
) {
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let recovered = false;
	await page.route(matches, async (route) => {
		await gate;
		if (recovered) return route.continue();
		await route.fulfill({
			status,
			json: { error: { code: "INTERNAL", message: unavailable } },
		});
	});
	return {
		fail: release,
		recover: () => {
			recovered = true;
			release();
		},
	};
}

async function capture(page: Page, info: TestInfo, name: string) {
	const path = info.outputPath(`${name}.png`);
	// Viewport captures show what a user actually sees, including the dock,
	// dialog and toast. Scroll the relevant state into view before calling.
	await page.screenshot({ path, animations: "disabled" });
	await info.attach(name, { path, contentType: "image/png" });
}

async function openGroup(page: Page) {
	const mounted = page.waitForResponse((response) =>
		response.url().includes("/api/v1/groups/G/recurring-expenses"),
	);
	await page.goto("/app/groups/G");
	await mounted;
	await expect(page.locator("tbody tr")).toHaveCount(30);
}

test.beforeEach(async ({ page }) => {
	// Manual pagination keeps screenshots from triggering extra requests.
	await page.addInitScript(() => {
		Object.defineProperty(window, "IntersectionObserver", { value: undefined });
	});
	await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
});

test("expense search loading, failure and recovery", async ({ page }, info) => {
	await openGroup(page);
	const original = await page.locator("tbody a").allTextContents();
	const mock = await mockFailure(
		page,
		(url) =>
			url.pathname === expenses && url.searchParams.get("search") === "meal 4",
	);
	try {
		const search = page.getByRole("searchbox", { name: "Search expenses" });
		await search.fill("meal 4");
		await search.press("Enter");
		const table = page
			.getByRole("region", { name: "Expenses", exact: true })
			.getByRole("table");
		await expect(table).toHaveAttribute("aria-busy", "true");
		await expect(table).toHaveCSS("opacity", "0.6");
		expect(await page.locator("tbody a").allTextContents()).toEqual(original);
		await search.scrollIntoViewIfNeeded();
		await capture(page, info, "search-loading");
		mock.fail();
		await expect(
			page.getByText("Couldn't load expenses", { exact: true }),
		).toBeVisible();
		await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
		await expect(page.locator("tbody tr")).toHaveCount(0);
		await capture(page, info, "search-error");
		mock.recover();
		await page.getByRole("button", { name: "Try again", exact: true }).click();
		await expect(page.locator("tbody tr")).toHaveCount(11);
	} finally {
		mock.recover();
		await page.unrouteAll({ behavior: "wait" });
	}
});

test("history continuation loading, failure and recovery preserves rows", async ({
	page,
}, info) => {
	await openGroup(page);
	const original = await page.locator("tbody a").allTextContents();
	const mock = await mockFailure(
		page,
		(url) => url.pathname === expenses && url.searchParams.has("cursor"),
	);
	try {
		await page.getByRole("button", { name: "Load more", exact: true }).click();
		const loading = page.getByRole("button", { name: /Loading…/ });
		await expect(loading).toBeDisabled();
		await loading.scrollIntoViewIfNeeded();
		await capture(page, info, "history-loading");
		mock.fail();
		const retry = page.getByRole("button", { name: "Try again", exact: true });
		await expect(retry).toBeVisible();
		expect(await page.locator("tbody a").allTextContents()).toEqual(original);
		await capture(page, info, "history-error");
		mock.recover();
		await retry.click();
		await expect(page.locator("tbody tr")).toHaveCount(60);
		expect(
			(await page.locator("tbody a").allTextContents()).slice(0, 30),
		).toEqual(original);
	} finally {
		mock.recover();
		await page.unrouteAll({ behavior: "wait" });
	}
});

for (const scenario of [
	{
		name: "payments",
		tab: "Balances",
		path: "/api/v2/groups/G/settlements",
		loading: "Loading payments…",
		error: "Couldn't load payments",
		retry: "Try again",
		success: "Test payment 59",
	},
	{
		name: "activity",
		tab: "Activity",
		path: "/api/v1/groups/G/activity",
		loading: "Loading activity…",
		error: "Couldn't load activity",
		retry: "Try again",
		success: "Newest changes first.",
	},
	{
		name: "settings",
		tab: "Settings",
		path: "/api/v1/app/groups/G/settings",
		loading: "Loading settings…",
		error: "Couldn't load settings",
		retry: "Try again",
		success: "Group name",
	},
]) {
	test(`${scenario.name} loading, failure and recovery`, async ({
		page,
	}, info) => {
		await openGroup(page);
		const mock = await mockFailure(
			page,
			(url) => url.pathname === scenario.path,
		);
		try {
			await page.getByRole("tab", { name: scenario.tab, exact: true }).click();
			const loading = page.getByText(scenario.loading, { exact: true });
			await expect(loading).toBeVisible();
			await loading.scrollIntoViewIfNeeded();
			await capture(page, info, `${scenario.name}-loading`);
			mock.fail();
			const error = page.getByText(scenario.error, { exact: true });
			await expect(error).toBeVisible();
			await error.scrollIntoViewIfNeeded();
			await capture(page, info, `${scenario.name}-error`);
			mock.recover();
			await page
				.getByRole("button", { name: scenario.retry, exact: true })
				.click();
			await expect(
				page.getByText(scenario.success, { exact: true }),
			).toBeVisible();
		} finally {
			mock.recover();
			await page.unrouteAll({ behavior: "wait" });
		}
	});
}

test("composer loading, failure and recovery", async ({ page }, info) => {
	// Reach the dashboard from the hydrated app: it has no group context, so
	// the composer has to wait for the full group list.
	await openGroup(page);
	await page.getByRole("link", { name: "Groups", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Your balances", level: 1 }),
	).toBeVisible();
	const mock = await mockFailure(
		page,
		(url) => url.pathname === "/api/v1/app/composer",
	);
	try {
		await page.getByRole("button", { name: "New expense or group" }).click();
		await page.getByRole("menuitem", { name: "New expense" }).click();
		await expect(
			page.getByText("Loading groups…", { exact: true }),
		).toBeVisible();
		await capture(page, info, "composer-loading");
		mock.fail();
		await expect(
			page.getByRole("dialog", { name: "Couldn't load your groups" }),
		).toBeVisible();
		await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
		await capture(page, info, "composer-error");
		mock.recover();
		await page.getByRole("button", { name: "Try again", exact: true }).click();
		await expect(
			page.getByRole("dialog", { name: "Add an expense" }),
		).toBeVisible();
		await expect(
			page.getByText("Loading groups…", { exact: true }),
		).toHaveCount(0);
	} finally {
		mock.recover();
		await page.unrouteAll({ behavior: "wait" });
	}
});

test("group context opens the composer despite a failed background group list", async ({
	page,
}) => {
	await openGroup(page);
	const mock = await mockFailure(
		page,
		(url) => url.pathname === "/api/v1/app/composer",
		422, // A non-retryable failure exercises the terminal error state.
	);
	try {
		await page
			.getByRole("button", { name: "New expense in this group" })
			.click();
		const dialog = page.getByRole("dialog", { name: "Add an expense" });
		await expect(dialog).toBeVisible();
		await expect(
			dialog.getByRole("textbox", { name: "Description" }),
		).toBeEditable();
		const failed = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === "/api/v1/app/composer" &&
				response.status() === 422,
		);
		mock.fail();
		await failed;
		await expect(dialog).toBeVisible();
		await expect(
			dialog.getByRole("textbox", { name: "Description" }),
		).toBeEditable();
		await expect(
			page.getByText("Loading groups…", { exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("dialog", { name: "Couldn't load your groups" }),
		).toHaveCount(0);
	} finally {
		mock.recover();
		await page.unrouteAll({ behavior: "wait" });
	}
});

test("route API failure and recovery", async ({ page }, info) => {
	await openGroup(page);
	// Navigate from the hydrated app: browser routing cannot intercept SSR's
	// server-side API calls on a direct page.goto to the failing route.
	// History lists report their own failures in place; a group's context is
	// what the page can't render without, so its failure is the route error.
	const mock = await mockFailure(
		page,
		(url) => url.pathname === "/api/v1/app/groups/other/context",
	);
	try {
		mock.fail();
		await page.getByRole("link", { name: "Groups", exact: true }).click();
		await page.getByRole("link", { name: /^owner other/ }).click();
		await expect(
			page.getByRole("heading", { name: "This page didn't load." }),
		).toBeVisible();
		await capture(page, info, "route-error");
		mock.recover();
		await page.getByRole("button", { name: "Try again", exact: true }).click();
		await expect(
			page.getByRole("heading", { name: "other", level: 1 }),
		).toBeVisible();
	} finally {
		mock.recover();
		await page.unrouteAll({ behavior: "wait" });
	}
});
