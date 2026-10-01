import { createClient } from "@libsql/client";
import {
	type Browser,
	type BrowserContext,
	expect,
	type Locator,
	type Page,
} from "@playwright/test";

export const uniqueEmail = (name: string) =>
	`${name}-${crypto.randomUUID()}@example.com`;

export async function account(browser: Browser) {
	const context = await browser.newContext({
		baseURL: "http://127.0.0.1:4173",
	});
	return { context, page: await context.newPage() };
}

// TanStack Start streams the HTML before React attaches handlers in dev mode.
// Do not click SSR-only forms/buttons: their native fallback can submit a GET.
export async function waitForHydration(page: Page, selector: string | Locator) {
	if (typeof selector !== "string") {
		await expect
			.poll(() =>
				selector.evaluate((element) =>
					Object.keys(element).some((key) => key.startsWith("__reactProps$")),
				),
			)
			.toBe(true);
		return;
	}
	await page.waitForFunction((css) => {
		const element = document.querySelector(css);
		return (
			element &&
			Object.keys(element).some((key) => key.startsWith("__reactProps$"))
		);
	}, selector);
}

export async function signUp(page: Page, name: string, email: string) {
	await page.goto("/signup");
	await page.waitForLoadState("networkidle");
	await waitForHydration(page, "#auth-form");
	await page.getByLabel("Name", { exact: true }).fill(name);
	await page.getByLabel("Email", { exact: true }).fill(email);
	await page
		.getByLabel("Password", { exact: true })
		.fill("e2e-strong-password");
	await page
		.getByRole("button", { name: /create account|sign up|start splitting/i })
		.last()
		.click();
	await expect(page).toHaveURL(/\/app(?:\/|$)/);
	await page.waitForLoadState("networkidle");
	await waitForHydration(page, "main button");
	return sessionUser(page.context());
}

export async function signIn(page: Page, email: string) {
	await page.goto("/login");
	await page.waitForLoadState("networkidle");
	await waitForHydration(page, "#auth-form");
	await page.getByLabel("Email", { exact: true }).fill(email);
	await page
		.getByLabel("Password", { exact: true })
		.fill("e2e-strong-password");
	await page
		.getByRole("button", { name: /log in|sign in/i })
		.last()
		.click();
	await expect(page).toHaveURL(/\/app(?:\/|$)/);
	await page.waitForLoadState("networkidle");
	return sessionUser(page.context());
}

export async function sessionUser(
	context: BrowserContext,
): Promise<{ id: string; email: string }> {
	const response = await context.request.get("/api/v1/session");
	expect(response.ok()).toBeTruthy();
	const session = await response.json();
	expect(session?.user?.id).toBeTruthy();
	return session.user;
}

// Only the runner's disposable DB is writable here. Never change production auth
// settings: the invitation endpoint must still reject an unverified account.
export async function markVerified(userId: string) {
	const file = process.env.E2E_DB_FILE;
	if (!file || process.env.TURSO_DATABASE_URL !== `file:${file}`)
		throw new Error("Refusing to modify a non-E2E database");
	const client = createClient({ url: `file:${file}` });
	try {
		const result = await client.execute({
			sql: "UPDATE user SET email_verified = 1 WHERE id = ? AND is_guest = 0",
			args: [userId],
		});
		expect(result.rowsAffected).toBe(1);
	} finally {
		client.close();
	}
}

export async function json<T = any>(
	context: BrowserContext,
	method: string,
	path: string,
	data?: unknown,
	status = 200,
): Promise<T> {
	const response = await context.request.fetch(`/api/v1${path}`, {
		method,
		...(method === "GET"
			? {}
			: {
					headers: { "Content-Type": "application/json" },
					data: JSON.stringify(data ?? {}),
				}),
	});
	expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(
		status,
	);
	return response.json() as Promise<T>;
}

export async function group(context: BrowserContext, name: string) {
	return json<{ id: string; members: { userId: string; role: string }[] }>(
		context,
		"POST",
		"/groups",
		{ name },
	);
}

export async function invite(
	context: BrowserContext,
	groupId: string,
	email: string,
) {
	return json<{
		invitationId: string;
		inviteUrl: string;
		emailDelivery: string;
	}>(context, "POST", `/groups/${groupId}/invitations`, {
		email,
		role: "member",
	});
}

export async function expense(
	context: BrowserContext,
	groupId: string,
	paidByUserId: string,
	participants: string[],
	amountMinor: number,
	currency = "INR",
) {
	return json<{
		id: string;
		shares: { userId: string; amountMinor: number }[];
	}>(context, "POST", `/groups/${groupId}/expenses`, {
		description: `Shared ${currency} expense`,
		amountMinor,
		currency,
		paidByUserId,
		splitMethod: "even",
		date: "2026-09-27",
		participants: participants.map((userId) => ({ userId, input: null })),
	});
}
