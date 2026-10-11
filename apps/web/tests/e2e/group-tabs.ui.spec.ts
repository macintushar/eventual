import { expect, type Page, test } from "@playwright/test";

/**
 * Count the navigations a click commits and the cross-fades the browser is
 * asked to run. A tab switch should be neither: it re-reads the URL, and a
 * page-wide cross-fade over a panel swap is what reads as a flash.
 */
async function instrument(page: Page) {
	await page.evaluate(() => {
		const router = (window as unknown as Record<string, Router>)
			.__TSR_ROUTER__ as Router;
		const w = window as unknown as Record<string, unknown>;
		w.__navigations = 0;
		w.__crossFades = 0;
		const commit = router.commitLocation.bind(router);
		router.commitLocation = (next) => {
			w.__navigations = (w.__navigations as number) + 1;
			return commit(next as never);
		};
		const crossFade = document.startViewTransition?.bind(document);
		if (crossFade) {
			document.startViewTransition = ((update: () => unknown) => {
				w.__crossFades = (w.__crossFades as number) + 1;
				return crossFade(update as () => void);
			}) as typeof document.startViewTransition;
		}
	});
}

type Router = {
	commitLocation: (next: Record<string, unknown>) => unknown;
};

const counts = (page: Page) =>
	page.evaluate(() => {
		const w = window as unknown as Record<string, unknown>;
		return {
			navigations: w.__navigations as number,
			crossFades: w.__crossFades as number,
		};
	});

async function openGroup(page: Page) {
	const mounted = page.waitForResponse((r) =>
		r.url().includes("/api/v1/groups/G/recurring-expenses"),
	);
	await page.goto("/app/groups/G");
	await mounted;
	await page.waitForLoadState("networkidle");
	await instrument(page);
}

test("one tab click is one navigation, with no cross-fade and no aborted transition", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await openGroup(page);

	await page.getByRole("tab", { name: "Balances", exact: true }).click();
	await page.waitForTimeout(1200);

	expect(await counts(page)).toEqual({ navigations: 1, crossFades: 0 });
	await expect(page).toHaveURL(/\?tab=balances$/);
	await expect(page.getByRole("tab", { name: "Balances" })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	expect(errors, "no aborted view transition").toEqual([]);

	// Every other tab, and back to the default that lives outside the URL.
	for (const name of ["Members", "Activity", "Settings", "Expenses"]) {
		await page.getByRole("tab", { name, exact: true }).click();
		await page.waitForTimeout(400);
		await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	}
	await expect(page).toHaveURL(/\/app\/groups\/G$/);
	expect(await counts(page)).toEqual({ navigations: 5, crossFades: 0 });
	expect(errors, "no aborted view transition").toEqual([]);
});

test("switching tabs leaves one history entry", async ({ page }) => {
	// Give the group page a real predecessor so Back has somewhere to land.
	await page.goto("/app");
	await page.waitForLoadState("networkidle");
	await page.goto("/app/groups/G");
	await page.waitForLoadState("networkidle");
	await instrument(page);

	await page.getByRole("tab", { name: "Members", exact: true }).click();
	await page.waitForTimeout(600);
	await page.getByRole("tab", { name: "Activity", exact: true }).click();
	await page.waitForTimeout(600);
	await expect(page).toHaveURL(/\?tab=activity$/);

	// Flicking between tabs must not fill the Back stack: one Back leaves the
	// group entirely rather than walking back through the tabs.
	await page.goBack();
	await page.waitForTimeout(800);
	await expect(page).toHaveURL(/\/app$/);
});

test("the open tab still survives a reload and a shared link", async ({
	page,
}) => {
	await page.goto("/app/groups/G?tab=settings");
	await expect(
		page.getByRole("tab", { name: "Settings", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await page.reload();
	await page.waitForLoadState("networkidle");
	await expect(
		page.getByRole("tab", { name: "Settings", exact: true }),
	).toHaveAttribute("aria-selected", "true");
});

test("settings tabs keep the page cross-fade they are meant to have", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto("/app/settings/profile");
	await page.waitForLoadState("networkidle");
	await instrument(page);

	// These triggers are real links to real routes, so the app-wide cross-fade
	// still applies — only the group page's panel swap opts out of it.
	await page.getByRole("tab", { name: "API keys" }).click();
	await page.waitForTimeout(1200);

	await expect(page).toHaveURL(/\/app\/settings\/api-keys$/);
	expect(await counts(page)).toEqual({ navigations: 1, crossFades: 1 });
	await expect(page.getByRole("tab", { name: "API keys" })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	expect(errors, "no aborted view transition").toEqual([]);
});
