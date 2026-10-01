import { expect, test } from "@playwright/test";
import {
	account,
	group,
	json,
	signUp,
	uniqueEmail,
	waitForHydration,
} from "./support";

test("category rules show the built-in keywords and flag duplicates", async ({
	browser,
}) => {
	const owner = await account(browser);
	try {
		await signUp(owner.page, "Rule Owner", uniqueEmail("rules"));
		const g = await group(owner.context, "Flat 4B");
		await owner.page.goto(`/app/groups/${g.id}`);
		await owner.page.waitForLoadState("networkidle");
		await waitForHydration(owner.page, "main button");
		await owner.page.getByRole("tab", { name: "Settings" }).click();

		await owner.page.getByRole("button", { name: "Built-in keywords" }).click();
		await expect(owner.page.getByText("hotel, hostel, airbnb")).toBeVisible();

		await owner.page.getByLabel("Description contains").fill("Coffee");
		await expect(
			owner.page.getByText(
				"Already covered: “coffee” is a built-in keyword for Food & drink.",
				{ exact: false },
			),
		).toBeVisible();
		await owner.page.getByLabel("Category", { exact: true }).fill("Work");
		await expect(
			owner.page.getByText(
				"This overrides the built-in Food & drink category for “coffee”.",
			),
		).toBeVisible();
		await owner.page.getByLabel("Description contains").fill("zomato");
		await expect(
			owner.page.getByText(/built-in (keyword for|.* category for)/),
		).toHaveCount(0);
	} finally {
		await owner.context.close();
	}
});

test("category rules backfill existing expenses from one review list", async ({
	browser,
}) => {
	const owner = await account(browser);
	try {
		const user = await signUp(
			owner.page,
			"Backfill Owner",
			uniqueEmail("fill"),
		);
		const g = await group(owner.context, "Backfill flat");
		const add = (description: string, category: string | null) =>
			json<{ id: string }>(owner.context, "POST", `/groups/${g.id}/expenses`, {
				description,
				category,
				amountMinor: 50000,
				currency: "INR",
				paidByUserId: user.id,
				splitMethod: "even",
				date: "2026-09-27",
				participants: [{ userId: user.id, input: null }],
			});
		await add("Zomato order", null);
		await add("Zomato office lunch", "Work");
		await add("Uber home", null);
		await add("Taxi to airport", "Work");
		await add("Birthday gift", "Gifts");

		await owner.page.goto(`/app/groups/${g.id}`);
		await owner.page.waitForLoadState("networkidle");
		await waitForHydration(owner.page, "main button");
		await owner.page.getByRole("tab", { name: "Settings" }).click();

		// The rule decides both Zomato expenses, including the hand-picked one.
		await expect(
			owner.page.getByLabel("Also update existing expenses that match"),
		).toBeChecked();
		await owner.page.getByLabel("Description contains").fill("zomato");
		await owner.page.getByLabel("Category", { exact: true }).fill("Takeout");
		await owner.page.getByRole("button", { name: "Add rule" }).click();
		await expect(
			owner.page.getByText("Category rule added. 2 existing expenses updated."),
		).toBeVisible();

		await owner.page.getByRole("button", { name: "Review categories" }).click();
		const dialog = owner.page.getByRole("dialog");
		await expect(dialog.getByText("Uber home")).toBeVisible();
		await expect(dialog.getByText("Taxi to airport")).toBeVisible();
		await expect(dialog.getByText("Birthday gift")).toHaveCount(0);
		await expect(dialog.getByText("Zomato")).toHaveCount(0);
		// Filling a gap is pre-ticked; replacing someone's choice is not.
		await expect(dialog.getByLabel(/Uber home/)).toBeChecked();
		await expect(dialog.getByLabel(/Taxi to airport/)).not.toBeChecked();
		await expect(dialog.getByText("1 of 2 selected")).toBeVisible();
		await expect(dialog.getByLabel("Select all")).toHaveAttribute(
			"aria-checked",
			"mixed",
		);
		await dialog.evaluate((node) =>
			Promise.all(node.getAnimations().map((animation) => animation.finished)),
		);
		await owner.page.screenshot({
			path: "test-results/category-review.png",
		});
		await dialog.getByRole("button", { name: "Update 1 expense" }).click();
		await expect(owner.page.getByText("1 expense updated")).toBeVisible();
		await expect(dialog).toHaveCount(0);

		const listing = await json<{
			items: { description: string; category: string | null }[];
		}>(owner.context, "GET", `/groups/${g.id}/expenses`);
		expect(
			Object.fromEntries(
				listing.items.map((row) => [row.description, row.category]),
			),
		).toEqual({
			"Zomato order": "Takeout",
			"Zomato office lunch": "Takeout",
			"Uber home": "Transport",
			"Taxi to airport": "Work",
			"Birthday gift": "Gifts",
		});
	} finally {
		await owner.context.close();
	}
});
