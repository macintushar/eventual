import { expect, test } from "@playwright/test";
import {
	account,
	expense,
	group,
	invite,
	json,
	markVerified,
	sessionUser,
	signIn,
	signUp,
	uniqueEmail,
	waitForHydration,
} from "./support";

test("two people join, split expenses, settle, and net balances across groups", async ({
	browser,
}) => {
	const a = await account(browser);
	const b = await account(browser);
	const c = await account(browser);
	try {
		const aEmail = uniqueEmail("owner");
		const bEmail = uniqueEmail("invitee");
		const aUser = await signUp(a.page, "Alex Owner", aEmail);
		await expect(a.page.getByText("No groups yet")).toBeVisible();
		await waitForHydration(a.page, "main button");

		// Exercise the stepped group composer rather than inserting a group directly.
		await a.page.getByRole("button", { name: "New group" }).first().click();
		const createDialog = a.page.getByRole("dialog", { name: "Start a group" });
		await createDialog
			.getByLabel("Group name", { exact: true })
			.fill("Weekend trip");
		await createDialog.getByRole("button", { name: "Continue" }).click();
		await createDialog.getByRole("button", { name: "Continue" }).click();
		await createDialog.getByRole("button", { name: "Create group" }).click();
		await expect(
			a.page.getByRole("heading", { name: "Weekend trip" }),
		).toBeVisible();
		const groups = await json<{ id: string; name: string; role: string }[]>(
			a.context,
			"GET",
			"/groups",
		);
		const first = groups.find((row) => row.name === "Weekend trip");
		if (!first) throw new Error("Created group is missing from the group list");
		expect(first.role).toBe("owner");

		await a.page.getByRole("tab", { name: "Members" }).click();
		await a.page.getByRole("button", { name: "Add person" }).click();
		const inviteDialog = a.page.getByRole("dialog", { name: "Add a person" });
		await inviteDialog.getByLabel("Name").fill("Blair");
		await inviteDialog.getByLabel("Email").fill(bEmail);
		await inviteDialog.getByRole("button", { name: "Add and invite" }).click();
		const link = inviteDialog.locator("#invite-url");
		await expect(link).toHaveValue(/\/invite\//);
		const inviteUrl = await link.inputValue();
		const invitationId = new URL(inviteUrl).pathname.split("/").at(-1);
		if (!invitationId) throw new Error("Invite link has no invitation ID");
		expect(
			(
				await json<any[]>(a.context, "GET", `/groups/${first.id}/invitations`)
			).some((row) => row.id === invitationId),
		).toBe(true);

		await b.page.goto(inviteUrl);
		await b.page.waitForLoadState("networkidle");
		await waitForHydration(b.page, "main a[href^='/signup']");
		await expect(b.page.getByText("Join Weekend trip")).toBeVisible();
		await b.page.getByRole("link", { name: "Create an account" }).click();
		await b.page.getByLabel("Name", { exact: true }).fill("Blair Member");
		await b.page.getByLabel("Email", { exact: true }).fill(bEmail);
		await b.page
			.getByLabel("Password", { exact: true })
			.fill("e2e-strong-password");
		await b.page.getByRole("button", { name: "Create account" }).click();
		await expect(b.page).toHaveURL(new RegExp(`/invite/${invitationId}$`));
		const bUser = await sessionUser(b.context);
		expect(await json<any[]>(b.context, "GET", "/groups")).toEqual([]);
		await json(
			b.context,
			"POST",
			`/invitations/${invitationId}/accept`,
			{},
			403,
		);

		// No email service is configured; promote only this disposable DB's user
		// after asserting the real unverified-user rejection above.
		await expect(b.page.getByText("Verify your email to join")).toBeVisible();
		await markVerified(bUser.id);
		await b.page.reload();
		await b.page.waitForLoadState("networkidle");
		await waitForHydration(b.page, "main button");
		await b.page.getByRole("button", { name: "Accept invitation" }).click();
		await expect(
			b.page.getByRole("heading", { name: "Weekend trip" }),
		).toBeVisible();
		expect(
			(await json<any[]>(b.context, "GET", "/groups")).map((row) => row.id),
		).toContain(first.id);
		expect(
			(await json<any[]>(a.context, "GET", `/groups/${first.id}/members`)).map(
				(row) => row.userId,
			),
		).toEqual(expect.arrayContaining([aUser.id, bUser.id]));
		expect(
			await json<any[]>(a.context, "GET", `/groups/${first.id}/invitations`),
		).toEqual([]);

		// A fresh browser signs in as B: independent sessions, same shared data.
		const bAgain = await account(browser);
		try {
			expect((await signIn(bAgain.page, bEmail)).id).toBe(bUser.id);
			expect(
				(await json<any[]>(bAgain.context, "GET", "/groups")).map(
					(row) => row.id,
				),
			).toContain(first.id);
			await bAgain.page
				.getByRole("button", { name: "Account menu" })
				.first()
				.click();
			await bAgain.page.getByRole("menuitem", { name: "Sign out" }).click();
			await bAgain.page
				.getByRole("alertdialog", { name: "Sign out?" })
				.getByRole("button", { name: "Sign out" })
				.click();
			await expect(bAgain.page).toHaveURL("http://127.0.0.1:4173/");
			expect(await json(bAgain.context, "GET", "/session")).toBeNull();
		} finally {
			await bAgain.context.close();
		}

		// The first expense is entered via the actual composer.
		await a.page.goto(`/app/groups/${first.id}`);
		// The dialog opens from a React handler; a click before hydration is
		// silently dropped (slow CI runners lose this race).
		await waitForHydration(a.page, "main button");
		await a.page.getByRole("button", { name: "Add expense" }).first().click();
		const composer = a.page.getByRole("dialog", { name: "Add an expense" });
		await composer.getByLabel("Description").fill("Dinner together");
		await composer.getByLabel("Amount").fill("200");
		await composer.getByRole("button", { name: "Continue" }).click();
		await composer.getByRole("button", { name: "Continue" }).click();
		await composer.getByRole("button", { name: "Add expense" }).click();
		await expect(a.page.getByText("Dinner together")).toBeVisible();
		const expenses = await json<any>(
			a.context,
			"GET",
			`/groups/${first.id}/expenses`,
		);
		const dinner =
			expenses.items?.find(
				(row: any) => row.description === "Dinner together",
			) ??
			expenses.expenses?.find(
				(row: any) => row.description === "Dinner together",
			);
		expect(dinner).toBeTruthy();
		const balances = await json<any>(
			b.context,
			"GET",
			`/groups/${first.id}/balances`,
		);
		expect(
			balances.members.find(
				(row: any) => row.userId === bUser.id && row.currency === "INR",
			).balanceMinor,
		).toBe(-10000);

		// B records payment through the UI; both independently signed-in users see it.
		await b.page.goto(`/app/groups/${first.id}`);
		await b.page.waitForLoadState("networkidle");
		// Tab switches are Radix handlers: hydration must land first.
		await waitForHydration(b.page, "main button");
		await b.page.getByRole("tab", { name: "Balances" }).click();
		await b.page.getByRole("button", { name: "Confirm paid" }).click();
		const settlementDialog = b.page.getByRole("dialog", {
			name: "Record settlement",
		});
		await expect(settlementDialog.getByLabel("Amount")).toHaveValue("100.00");
		await settlementDialog
			.getByRole("button", { name: "Record", exact: true })
			.click();
		await expect(b.page.getByText("Everyone is settled up.")).toBeVisible();
		const payment = (
			await json<any[]>(b.context, "GET", `/groups/${first.id}/settlements`)
		)[0];
		expect(
			(await json<any>(a.context, "GET", `/groups/${first.id}/balances`))
				.transfers,
		).toEqual([]);
		expect(
			(
				await json<any[]>(a.context, "GET", `/groups/${first.id}/settlements`)
			).some((row) => row.id === payment.id),
		).toBe(true);
		await json(b.context, "DELETE", `/settlements/${payment.id}`);
		expect(
			(await json<any>(b.context, "GET", `/groups/${first.id}/balances`))
				.transfers[0].amountMinor,
		).toBe(10000);

		const second = await group(a.context, "City flat");
		const secondInvite = await invite(a.context, second.id, bEmail);
		await json(
			b.context,
			"POST",
			`/invitations/${secondInvite.invitationId}/accept`,
			{},
		);
		await expense(b.context, second.id, bUser.id, [aUser.id, bUser.id], 6000);
		const net = await json<any[]>(a.context, "GET", "/me/balances");
		const pair = net.find(
			(row) => row.counterpartyUserId === bUser.id && row.currency === "INR",
		);
		expect(pair.amountMinor).toBe(7000);
		expect(
			Object.fromEntries(
				pair.groups.map((row: any) => [row.groupId, row.amountMinor]),
			),
		).toEqual({ [first.id]: 10000, [second.id]: -3000 });
		await expense(
			b.context,
			second.id,
			bUser.id,
			[aUser.id, bUser.id],
			4000,
			"USD",
		);
		expect(
			(await json<any[]>(a.context, "GET", "/me/balances")).find(
				(row) => row.currency === "USD",
			).amountMinor,
		).toBe(-2000);
		const dashboard = await json<any>(a.context, "GET", "/app/dashboard");
		expect(
			dashboard.crossGroupBalances.find((row: any) => row.currency === "INR")
				.amountMinor,
		).toBe(7000);

		await signUp(c.page, "Casey Stranger", uniqueEmail("stranger"));
		for (const id of [first.id, second.id]) {
			await json(c.context, "GET", `/groups/${id}`, undefined, 403);
			await json(c.context, "GET", `/groups/${id}/expenses`, undefined, 403);
			await json(
				c.context,
				"POST",
				`/groups/${id}/expenses`,
				{
					description: "Intrusion",
					amountMinor: 100,
					currency: "INR",
					paidByUserId: aUser.id,
					splitMethod: "even",
					date: "2026-09-27",
					participants: [{ userId: aUser.id, input: null }],
				},
				403,
			);
		}
		await json(c.context, "GET", `/expenses/${dinner.id}`, undefined, 403);
		await c.page.goto(`/app/groups/${first.id}`);
		await expect(
			c.page.getByRole("heading", { name: "Weekend trip" }),
		).not.toBeVisible();
	} finally {
		await Promise.all([
			a.context.close(),
			b.context.close(),
			c.context.close(),
		]);
	}
});
