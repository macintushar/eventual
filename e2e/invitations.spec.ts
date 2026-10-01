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
	waitForHydration,
} from "./support";

// Regressions from the 2026-09-27 "Trip to TVM" incident: invitees who created
// an account never reached the invite, and the owner saw "Invalid request".
test("invitees are guided back to the invite and owners see what failed", async ({
	browser,
}) => {
	const owner = await account(browser);
	const other = await account(browser);
	try {
		await signUp(owner.page, "Siva Owner", uniqueEmail("owner"));
		const g = await group(owner.context, "Trip to TVM");
		const invitedEmail = uniqueEmail("invited");
		const sent = await invite(owner.context, g.id, invitedEmail);

		// Signed in under a different address: explain instead of offering Accept.
		const otherEmail = uniqueEmail("lookalike");
		const otherUser = await signUp(other.page, "Ashok Other", otherEmail);
		await markVerified(otherUser.id);
		await other.page.goto(sent.inviteUrl);
		await other.page.waitForLoadState("networkidle");
		await expect(
			other.page.getByText("This invitation is for another email"),
		).toBeVisible();
		await expect(
			other.page.getByRole("button", { name: "Accept invitation" }),
		).toHaveCount(0);
		await waitForHydration(other.page, "main button");
		await other.page
			.getByRole("button", { name: `Sign in as ${invitedEmail}` })
			.click();
		await expect(other.page).toHaveURL(
			new RegExp(`/login\\?redirect=${encodeURIComponent(sent.inviteUrl)}`),
		);

		// The verification link forwards a signed-in user to where they started.
		await expect(
			(
				await owner.page.goto(
					`/verify-email?next=${encodeURIComponent(sent.inviteUrl)}`,
				)
			)?.ok(),
		).toBeTruthy();
		await expect(owner.page).toHaveURL(new RegExp(`${sent.inviteUrl}$`));
		await owner.page.goto("/verify-email?next=%2F%2Fevil.example");
		await expect(owner.page).toHaveURL(/\/app$/);

		// Add person names the field that failed and flags an existing invite.
		await owner.page.goto(`/app/groups/${g.id}`);
		await owner.page.waitForLoadState("networkidle");
		await waitForHydration(owner.page, "main button");
		await owner.page.getByRole("tab", { name: "Members" }).click();
		await owner.page.getByRole("button", { name: "Add person" }).click();
		const dialog = owner.page.getByRole("dialog", { name: "Add a person" });
		await dialog.getByLabel("Name").fill("Ashok");
		await dialog.getByLabel("Email").fill(invitedEmail.toUpperCase());
		await expect(
			dialog.getByText(`${invitedEmail} already has a pending invitation.`, {
				exact: false,
			}),
		).toBeVisible();
		await dialog.getByLabel("Email").fill(uniqueEmail("guest"));
		await dialog.getByLabel("Phone").fill("9876543210");
		await dialog.getByRole("button", { name: "Add and invite" }).click();
		await expect(
			owner.page.getByText(
				"Phone: Include the country code, e.g. +919876543210",
			),
		).toBeVisible();
		expect(
			(await json<any[]>(owner.context, "GET", `/groups/${g.id}/members`))
				.length,
		).toBe(1);
	} finally {
		await owner.context.close();
		await other.context.close();
	}
});

test("a guest's email can be corrected, their payment recorded, and their account takes over", async ({
	browser,
}) => {
	const owner = await account(browser);
	const invitee = await account(browser);
	try {
		const ownerUser = await signUp(
			owner.page,
			"Siva Owner",
			uniqueEmail("owner"),
		);
		const g = await group(owner.context, "Trip to TVM");
		await owner.page.goto(`/app/groups/${g.id}`);
		await owner.page.waitForLoadState("networkidle");
		await waitForHydration(owner.page, "main button");
		await owner.page.getByRole("tab", { name: "Members" }).click();

		// One dialog adds and invites; the person is usable in expenses at once.
		await owner.page.getByRole("button", { name: "Add person" }).click();
		const add = owner.page.getByRole("dialog", { name: "Add a person" });
		await add.getByLabel("Name").fill("Gomathi");
		await add.getByLabel("Email").fill(uniqueEmail("mistyped"));
		await add.getByRole("button", { name: "Add and invite" }).click();
		await expect(add.locator("#invite-url")).toHaveValue(/\/invite\//);
		await add.getByRole("button", { name: "Done" }).click();
		const members = await json<any[]>(
			owner.context,
			"GET",
			`/groups/${g.id}/members`,
		);
		const guest = members.find((row) => row.name === "Gomathi");
		expect(guest?.isGuest).toBe(true);
		expect(guest?.email).toMatch(/@guests\.eventual\.invalid$/);
		await expense(
			owner.context,
			g.id,
			ownerUser.id,
			[ownerUser.id, guest.userId],
			3000,
		);

		// The owner records the guest's cash payment to them.
		await owner.page.reload();
		await owner.page.waitForLoadState("networkidle");
		await waitForHydration(owner.page, "main button");
		await owner.page.getByRole("tab", { name: "Balances" }).click();
		await owner.page.getByRole("button", { name: "Confirm paid" }).click();
		const settle = owner.page.getByRole("dialog", {
			name: "Record settlement",
		});
		await expect(settle.getByLabel("Paid by")).toContainText("Gomathi");
		await settle.getByRole("button", { name: "Record" }).click();
		await expect(owner.page.getByText("Everyone is settled up.")).toBeVisible();

		// The address was wrong: fix it, which re-issues the invitation.
		const realEmail = uniqueEmail("gomathi");
		await owner.page.getByRole("tab", { name: "Members" }).click();
		await owner.page
			.getByRole("button", { name: "Edit Gomathi's details" })
			.click();
		const edit = owner.page.getByRole("dialog", { name: "Edit Gomathi" });
		await edit.getByLabel("Email").fill(realEmail);
		// Phones are unique across the database, which repeats share.
		await edit.getByLabel("Phone").fill(`+9198${String(Date.now()).slice(-8)}`);
		await edit.getByRole("button", { name: "Save" }).click();
		await expect(
			owner.page.getByText(`Guest · invited ${realEmail}`),
		).toBeVisible();
		const invites = await json<any[]>(
			owner.context,
			"GET",
			`/groups/${g.id}/invitations`,
		);
		expect(invites.map((row) => row.email)).toEqual([realEmail]);

		// Gomathi signs up with the right address and takes over the guest.
		const gomathi = await signUp(invitee.page, "Gomathi R", realEmail);
		await markVerified(gomathi.id);
		await invitee.page.goto("/app/settings/profile");
		await invitee.page.waitForLoadState("networkidle");
		await invitee.page.getByRole("link", { name: "Review" }).click();
		await waitForHydration(invitee.page, "main button");
		await invitee.page
			.getByRole("button", { name: "Accept invitation" })
			.click();
		await expect(
			invitee.page.getByRole("heading", { name: "Trip to TVM" }),
		).toBeVisible();
		const after = await json<any[]>(
			owner.context,
			"GET",
			`/groups/${g.id}/members`,
		);
		expect(after.map((row) => row.userId).sort()).toEqual(
			[ownerUser.id, gomathi.id].sort(),
		);
		const settlements = await json<any[]>(
			owner.context,
			"GET",
			`/groups/${g.id}/settlements`,
		);
		expect(settlements.map((row) => row.fromUserId)).toEqual([gomathi.id]);
	} finally {
		await owner.context.close();
		await invitee.context.close();
	}
});
