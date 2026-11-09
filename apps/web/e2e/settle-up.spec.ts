/**
 * Settling up in a group shaped like the "Hill station trip" incident:
 * seven people, four big expenses paid by Sam and Lee and split unevenly,
 * then Ash and Kai pay what they owe.
 *
 * The incident: Jo recorded the payment the list suggested and every other
 * row in "Simplified debts" changed. These tests drive the real UI and API to
 * check that recording, deleting, part-paying and off-plan payments leave the
 * rows nobody touched exactly where they were.
 */
import {
	type BrowserContext,
	expect,
	type Locator,
	type Page,
	test,
} from "@playwright/test";
import {
	account,
	json,
	signUp,
	uniqueEmail,
	waitForHydration,
} from "./support";

const GUESTS = ["Kai", "Toby", "Lee", "Jo", "Ash", "Riley"] as const;
type Person = (typeof GUESTS)[number] | "Sam";

/** The list right after the first two payments, by name and minor units. */
const INITIAL_PLAN = [
	"Jo>Lee:10417",
	"Jo>Sam:234300",
	"Riley>Sam:472033",
	"Toby>Lee:489433",
];

type Transfer = {
	from: { userId: string; name: string };
	to: { userId: string; name: string };
	amountMinor: number;
	currency: string;
};

// The ledger is replayed in timestamp order and timestamps are whole seconds.
// Real users are seconds apart; keep each step in its own second so the test
// checks the behaviour people see, not the same-second tie-break.
const nextSecond = () =>
	new Promise((resolve) => setTimeout(resolve, 1020 - (Date.now() % 1000)));

async function incidentGroup(context: BrowserContext, ownerId: string) {
	const g = await json<{ id: string }>(context, "POST", "/groups", {
		name: "Hill station trip",
	});
	const ids: Record<Person, string> = { Sam: ownerId } as Record<
		Person,
		string
	>;
	for (const name of GUESTS)
		ids[name] = (
			await json<{ userId: string }>(
				context,
				"POST",
				`/groups/${g.id}/members`,
				{ name },
			)
		).userId;

	const spend = async (
		description: string,
		payer: Person,
		shares: Partial<Record<Person, number>>,
	) => {
		await nextSecond();
		return json<{ id: string }>(context, "POST", `/groups/${g.id}/expenses`, {
			description,
			amountMinor: Object.values(shares).reduce((a, b) => a + (b ?? 0), 0),
			currency: "INR",
			paidByUserId: ids[payer],
			splitMethod: "exact",
			date: "2026-05-30",
			participants: Object.entries(shares).map(([name, input]) => ({
				userId: ids[name as Person],
				input,
			})),
		});
	};
	const pay = async (from: Person, to: Person, amountMinor: number) => {
		await nextSecond();
		return json<{ id: string }>(
			context,
			"POST",
			`/groups/${g.id}/settlements`,
			{
				fromUserId: ids[from],
				toUserId: ids[to],
				amountMinor,
				currency: "INR",
			},
		);
	};

	const hotel = await spend("Hotel", "Sam", {
		Kai: 300000,
		Toby: 120000,
		Riley: 180000,
		Jo: 106333,
		Sam: 150000,
	});
	const cab = await spend("Cab", "Sam", {
		Kai: 189436,
		Toby: 80000,
		Riley: 120000,
		Jo: 100000,
		Sam: 50000,
	});
	const offerings = await spend("Entry tickets", "Lee", {
		Ash: 235117,
		Toby: 189433,
		Riley: 100000,
		Jo: 20000,
		Lee: 60000,
	});
	const lunch = await spend("Lunch", "Lee", {
		Ash: 200000,
		Toby: 100000,
		Riley: 72033,
		Jo: 18384,
		Lee: 40000,
	});
	await pay("Ash", "Lee", 435117);
	await pay("Kai", "Sam", 489436);

	const balances = () =>
		json<{
			members: { userId: string; name: string; balanceMinor: number }[];
			transfers: Transfer[];
		}>(context, "GET", `/groups/${g.id}/balances`);
	const plan = async () =>
		(await balances()).transfers
			.map((t) => `${t.from.name}>${t.to.name}:${t.amountMinor}`)
			.sort();
	const nets = async () =>
		Object.fromEntries(
			(await balances()).members.map((m) => [m.name, m.balanceMinor]),
		);
	return {
		id: g.id,
		ids,
		pay,
		plan,
		nets,
		balances,
		expenses: { hotel, cab, offerings, lunch },
	};
}

/** Rows of the "Simplified debts" card, as the page shows them. */
function debtRows(page: Page): Locator {
	return page
		.locator("[data-slot=card]")
		.filter({
			has: page.locator("[data-slot=card-title]", {
				hasText: "Simplified debts",
			}),
		})
		.locator("[data-slot=item]");
}

async function shownRows(page: Page) {
	return (await debtRows(page).allInnerTexts())
		.map((text) => text.replace(/\s+/g, " ").trim())
		.sort();
}

async function openBalances(page: Page, groupId: string) {
	await page.goto(`/app/groups/${groupId}`);
	await page.waitForLoadState("networkidle");
	const tab = page.getByRole("tab", { name: "Balances" });
	await waitForHydration(page, tab);
	await tab.click();
	await expect(debtRows(page).first()).toBeVisible();
}

const without = (rows: string[], key: string) =>
	rows.filter((row) => !row.startsWith(`${key}:`));

/** Record a payment from its row's own button, optionally editing the amount. */
async function payFromRow(page: Page, amount: string, editTo?: string) {
	await debtRows(page)
		.filter({ hasText: amount })
		.getByRole("button", { name: "Record payment" })
		.click();
	const dialog = page.getByRole("dialog", { name: "Record a payment" });
	if (editTo) await dialog.getByLabel("Amount").fill(editTo);
	await dialog
		.getByRole("button", { name: "Record payment", exact: true })
		.click();
	await expect(dialog).toBeHidden();
}

async function deletePayment(page: Page, amount: string) {
	await page
		.getByRole("button", { name: `Delete payment of ₹${amount}` })
		.first()
		.click();
	await page
		.getByRole("alertdialog", { name: "Delete payment?" })
		.getByRole("button", { name: "Delete payment" })
		.click();
}

test("recording, deleting and part-paying suggested rows never reshuffles the rest", async ({
	browser,
}) => {
	const a = await account(browser);
	try {
		const owner = await signUp(a.page, "Sam", uniqueEmail("sam"));
		const g = await incidentGroup(a.context, owner.id);
		expect(await g.plan()).toEqual(INITIAL_PLAN);

		await openBalances(a.page, g.id);
		const initial = await shownRows(a.page);
		expect(initial).toHaveLength(4);
		const shownJo = initial.filter((row) => row.includes("2,343.00"));
		expect(shownJo).toHaveLength(1);

		// The incident loop: Jo's payment recorded and deleted, twice.
		for (let round = 0; round < 2; round++) {
			await nextSecond();
			await payFromRow(a.page, "2,343.00");
			await expect
				.poll(() => shownRows(a.page))
				.toEqual(initial.filter((row) => row !== shownJo[0]));
			expect(await g.plan()).toEqual(without(INITIAL_PLAN, "Jo>Sam"));

			await nextSecond();
			await deletePayment(a.page, "2,343.00");
			await expect.poll(() => shownRows(a.page)).toEqual(initial);
			expect(await g.plan()).toEqual(INITIAL_PLAN);
		}

		// A part payment shrinks its own row and nothing else.
		await nextSecond();
		await payFromRow(a.page, "4,720.33", "1000");
		await expect
			.poll(() => g.plan())
			.toEqual(
				[...without(INITIAL_PLAN, "Riley>Sam"), "Riley>Sam:372033"].sort(),
			);
		await expect(debtRows(a.page).filter({ hasText: "3,720.33" })).toHaveCount(
			1,
		);

		// Pay every remaining row from the page, in list order; each payment
		// removes exactly its own row.
		for (const amount of ["4,894.33", "3,720.33", "2,343.00", "104.17"]) {
			const before = await g.plan();
			const paid = before.find((row) =>
				row.endsWith(`:${amount.replace(/[,.]/g, "")}`),
			);
			expect(paid, `row for ${amount}`).toBeTruthy();
			await nextSecond();
			await payFromRow(a.page, amount);
			await expect
				.poll(() => g.plan())
				.toEqual(before.filter((row) => row !== paid));
		}
		await expect(a.page.getByText("Everyone is settled up.")).toBeVisible();
		expect(Object.values(await g.nets()).every((n) => n === 0)).toBe(true);
	} finally {
		await a.context.close();
	}
});

test("ticking a share paid and an off-plan payment still settle the group exactly", async ({
	browser,
}) => {
	const a = await account(browser);
	try {
		const owner = await signUp(a.page, "Sam", uniqueEmail("sam"));
		const g = await incidentGroup(a.context, owner.id);
		expect(await g.plan()).toEqual(INITIAL_PLAN);

		// Sam's own cross-group view comes from the same replayed rows.
		const owed = await json<
			{ counterpartyUserId: string; amountMinor: number }[]
		>(a.context, "GET", "/me/balances");
		expect(
			Object.fromEntries(
				owed.map((row) => [row.counterpartyUserId, row.amountMinor]),
			),
		).toEqual({ [g.ids.Riley]: 472033, [g.ids.Jo]: 234300 });

		// Toby's ₹1,894.33 offerings share is ticked on the expense
		// page: it fits his row to Lee, so only that row shrinks.
		await nextSecond();
		await a.page.goto(
			`/app/groups/${g.id}/expenses/${g.expenses.offerings.id}`,
		);
		await a.page.waitForLoadState("networkidle");
		const tick = a.page.getByRole("checkbox", {
			name: "Mark Toby's share paid",
		});
		await waitForHydration(a.page, tick);
		await tick.click();
		await expect(tick).toBeChecked();
		await expect
			.poll(() => g.plan())
			.toEqual(
				[...without(INITIAL_PLAN, "Toby>Lee"), "Toby>Lee:300000"].sort(),
			);

		// Jo pays Lee ₹500, more than the ₹104.17 row suggests. Payments
		// are free-form, so it is recorded and the list is repaired around it.
		await openBalances(a.page, g.id);
		await nextSecond();
		await a.page
			.getByRole("button", { name: "Record payment" })
			.first()
			.click();
		const dialog = a.page.getByRole("dialog", { name: "Record a payment" });
		await dialog.locator("#settle-from").click();
		await a.page.getByRole("option", { name: "Jo", exact: true }).click();
		await dialog.locator("#settle-to").click();
		await a.page.getByRole("option", { name: "Lee", exact: true }).click();
		await dialog.getByLabel("Amount").fill("500");
		await dialog
			.getByRole("button", { name: "Record payment", exact: true })
			.click();
		await expect(dialog).toBeHidden();
		await expect.poll(async () => (await g.nets()).Jo).toBe(-194717);

		// Whatever the list now says, it must add up to everyone's balance and
		// paying it row by row must leave the whole group at zero.
		const { members, transfers } = await g.balances();
		const owing = members.filter((m) => m.balanceMinor !== 0).length;
		expect(transfers.length).toBeLessThanOrEqual(owing - 1);
		for (const m of members) {
			const net = transfers.reduce(
				(sum, t) =>
					sum +
					(t.to.userId === m.userId ? t.amountMinor : 0) -
					(t.from.userId === m.userId ? t.amountMinor : 0),
				0,
			);
			expect(net, m.name).toBe(m.balanceMinor);
		}
		for (const t of transfers) {
			const before = await g.plan();
			await nextSecond();
			await json(a.context, "POST", `/groups/${g.id}/settlements`, {
				fromUserId: t.from.userId,
				toUserId: t.to.userId,
				amountMinor: t.amountMinor,
				currency: t.currency,
			});
			const key = `${t.from.name}>${t.to.name}:${t.amountMinor}`;
			expect(await g.plan()).toEqual(before.filter((row) => row !== key));
		}
		expect(Object.values(await g.nets()).every((n) => n === 0)).toBe(true);
		await a.page.reload();
		await a.page.waitForLoadState("networkidle");
		await a.page.getByRole("tab", { name: "Balances" }).click();
		await expect(a.page.getByText("Everyone is settled up.")).toBeVisible();
	} finally {
		await a.context.close();
	}
});

// Known bug: leaving checks for unpaid shares as well as the balance. Paying
// Lee settles Toby, but his shares on Sam's hotel and cab stay
// unpaid, so he can never be removed. Unfixme once the exit check uses the
// balance alone.
test.fixme("a member who settled through an indirect row can be removed", async ({
	browser,
}) => {
	const a = await account(browser);
	try {
		const owner = await signUp(a.page, "Sam", uniqueEmail("sam"));
		const g = await incidentGroup(a.context, owner.id);
		for (const row of INITIAL_PLAN) {
			const [pair, amount] = row.split(":");
			const [from, to] = pair.split(">") as [Person, Person];
			await g.pay(from, to, Number(amount));
		}
		expect(await g.plan()).toEqual([]);
		expect((await g.nets()).Toby).toBe(0);
		await json(a.context, "DELETE", `/groups/${g.id}/members/${g.ids.Toby}`);
	} finally {
		await a.context.close();
	}
});
