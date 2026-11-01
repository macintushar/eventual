import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import {
	type BrowserContext,
	chromium,
	type Locator,
	type Page,
} from "playwright";

/**
 * Recaptures the help center screenshots in public/help/ from a real app.
 *
 *   bun run help:shots            every shot
 *   bun run help:shots settle     only shots whose name contains "settle"
 *
 * It starts the app on a throwaway database, seeds one consistent cast
 * (Sam Rivera and friends, in euros), then walks each article's steps and
 * saves each one cropped to the panel it is about, at one scale. Nothing
 * touches your own database.
 */

const PORT = 4191;
/**
 * Set HELP_SHOTS_ORIGIN (and E2E_DB_FILE) to reuse a dev server that is
 * already running on a disposable database, while iterating on a shot.
 */
const REUSE = process.env.HELP_SHOTS_ORIGIN;
const ORIGIN = REUSE ?? `http://127.0.0.1:${PORT}`;
/** Invite links in the shots show the hosted address, not localhost. */
const SHOWN_ORIGIN = "https://eventual.macintushar.xyz";
const OUT = path.resolve(import.meta.dirname, "../public/help");
const PASSWORD = "help-shots-password";
const only = process.argv[2];

/* ------------------------------------------------------------------ server */

function startServer() {
	const dir = mkdtempSync(path.join(tmpdir(), "eventual-help-shots-"));
	const file = path.join(dir, "db.sqlite");
	const env = {
		...process.env,
		TURSO_DATABASE_URL: `file:${file}`,
		TURSO_AUTH_TOKEN: "",
		BETTER_AUTH_URL: ORIGIN,
		BETTER_AUTH_SECRET: "help-shots-disposable-secret-not-for-production",
		RESEND_API_KEY: "",
		EMAIL_FROM: "",
		GOOGLE_CLIENT_ID: "",
		GOOGLE_CLIENT_SECRET: "",
		POSTHOG_PROJECT_TOKEN: "",
		VITE_POSTHOG_PROJECT_TOKEN: "",
		SENTRY_DSN: "",
		VITE_SENTRY_DSN: "",
	};
	const migrate = spawnSync("bun", ["run", "db:migrate"], { env });
	if (migrate.status !== 0) throw new Error(String(migrate.stderr));
	const server = spawn(
		"bun",
		["run", "dev", "--", "--host", "127.0.0.1", "--port", String(PORT)],
		{ env, stdio: "ignore" },
	);
	return {
		file,
		async ready() {
			for (let i = 0; i < 240; i++) {
				const ok = await fetch(`${ORIGIN}/api/v1/health`)
					.then((r) => r.ok)
					.catch(() => false);
				if (ok) return;
				await new Promise((r) => setTimeout(r, 500));
			}
			throw new Error("The dev server didn't start");
		},
		stop() {
			server.kill();
			rmSync(dir, { recursive: true, force: true });
		},
	};
}

/* -------------------------------------------------------------------- seed */

async function api<T>(
	context: BrowserContext,
	method: string,
	route: string,
	data?: unknown,
): Promise<T> {
	const response = await context.request.fetch(`${ORIGIN}/api/v1${route}`, {
		method,
		...(data === undefined
			? {}
			: { headers: { "Content-Type": "application/json" }, data }),
	});
	if (!response.ok())
		throw new Error(`${method} ${route}: ${await response.text()}`);
	return response.json() as Promise<T>;
}

async function account(
	context: BrowserContext,
	db: string,
	name: string,
	email: string,
) {
	const response = await context.request.post(
		`${ORIGIN}/api/auth/sign-up/email`,
		// Signing up also signs this browser context in.
		{ data: { name, email, password: PASSWORD }, headers: { Origin: ORIGIN } },
	);
	let result = response;
	// Reusing a dev server, the account may exist from an earlier run.
	if (response.status() === 422)
		result = await context.request.post(`${ORIGIN}/api/auth/sign-in/email`, {
			data: { email, password: PASSWORD },
			headers: { Origin: ORIGIN },
		});
	if (!result.ok()) throw new Error(await result.text());
	const { user } = (await result.json()) as { user: { id: string } };
	const client = createClient({ url: `file:${db}` });
	await client.execute({
		sql: "UPDATE user SET email_verified = 1 WHERE id = ?",
		args: [user.id],
	});
	client.close();
	return user.id;
}

type Member = { userId: string; name: string };

async function makeGroup(
	context: BrowserContext,
	name: string,
	guests: string[],
) {
	const group = await api<{ id: string }>(context, "POST", "/groups", {
		name,
	});
	for (const guest of guests)
		await api(context, "POST", `/groups/${group.id}/members`, {
			name: guest,
		});
	const members = await api<Member[]>(
		context,
		"GET",
		`/groups/${group.id}/members`,
	);
	const id = (who: string) => {
		const member = members.find((m) => m.name.startsWith(who));
		if (!member) throw new Error(`No member ${who}`);
		return member.userId;
	};
	return { id: group.id, member: id, members };
}

async function spend(
	context: BrowserContext,
	groupId: string,
	description: string,
	euros: number,
	paidBy: string,
	participants: string[],
	date: string,
) {
	return api<{ id: string }>(context, "POST", `/groups/${groupId}/expenses`, {
		description,
		amountMinor: Math.round(euros * 100),
		currency: "EUR",
		paidByUserId: paidBy,
		splitMethod: "even",
		date,
		participants: participants.map((userId) => ({ userId, input: null })),
	});
}

/* ----------------------------------------------------------------- capture */

/** Dev-only overlays (TanStack devtools, toasts) never belong in a shot. */
async function hideOverlays(page: Page) {
	await page.addStyleTag({
		content: `
			[data-tsd-control], .tsqd-parent-container, .tsqd-open-btn-container,
			section[aria-label^="Notifications"], [data-sonner-toaster],
			nextjs-portal, vite-error-overlay { display: none !important; }
			*, *::before, *::after { caret-color: transparent !important; }
		`,
	});
	await page.evaluate(() => {
		for (const el of document.body.querySelectorAll<HTMLElement>("body > *")) {
			if (el.matches("[data-slot], [role=dialog], [data-radix-portal]"))
				continue;
			if (el.shadowRoot || el.id.startsWith("tsd") || el.matches("[data-tsd-control]"))
				el.style.display = "none";
		}
	});
}

async function settle(page: Page) {
	await page.waitForLoadState("networkidle");
	await page.evaluate(() => document.fonts.ready);
	// Let entrance animations (rise-in, dialog zoom) finish.
	await page.waitForTimeout(700);
	await hideOverlays(page);
}

/**
 * Screenshots the union of `regions` plus `pad` of whatever sits around them,
 * so each shot is the panel the step is about, not the whole window.
 */
async function shoot(
	page: Page,
	name: string,
	regions: Locator[],
	pad = 24,
) {
	if (only && !name.includes(only)) return;
	await settle(page);
	// A dialog is shot on the plain canvas: the dimmed page behind it would
	// only show as cut-off scraps around the crop.
	const backdrop = await page.addStyleTag({
		content: `[data-slot="dialog-overlay"], [data-slot="alert-dialog-overlay"],
		.dock-scrim {
			background: var(--background) !important;
			backdrop-filter: none !important;
		}`,
	});
	const boxes = [];
	for (const region of regions) {
		for (const match of await region.all()) {
			const box = await match.boundingBox();
			if (box && box.width > 0 && box.height > 0) boxes.push(box);
		}
	}
	if (!boxes.length) throw new Error(`${name}: region not visible`);
	const viewport = page.viewportSize();
	if (!viewport) throw new Error("No viewport");
	const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
	const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
	const right = Math.min(
		viewport.width,
		Math.max(...boxes.map((b) => b.x + b.width)) + pad,
	);
	const bottom = Math.min(
		viewport.height,
		Math.max(...boxes.map((b) => b.y + b.height)) + pad,
	);
	const png = await page.screenshot({
		clip: { x, y, width: right - x, height: bottom - y },
	});
	// Chromium encodes WebP for us, so the script needs no image library.
	const webp = await page.evaluate(async (base64) => {
		const image = new Image();
		image.src = `data:image/png;base64,${base64}`;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		canvas.getContext("2d")?.drawImage(image, 0, 0);
		return canvas.toDataURL("image/webp", 0.86).split(",")[1];
	}, png.toString("base64"));
	await backdrop.evaluate((tag) => (tag as Element).remove());
	writeFileSync(path.join(OUT, `${name}.webp`), Buffer.from(webp, "base64"));
	console.log(`  ${name}.webp`);
}

async function hydrated(page: Page) {
	await page.waitForLoadState("networkidle");
	await page.waitForFunction(() => {
		const el = document.querySelector("main button, main a");
		return (
			el && Object.keys(el).some((key) => key.startsWith("__reactProps$"))
		);
	});
}

async function open(page: Page, route: string) {
	await page.goto(`${ORIGIN}${route}`);
	await hydrated(page);
}



/* ------------------------------------------------------------------- shots */

/** A page's content, without the masthead above it. */
const content = (page: Page) => page.locator("main > *");

const dialog = (page: Page, name: string) =>
	page.getByRole("dialog", { name });

async function closed(locator: Locator) {
	await locator.waitFor({ state: "detached" });
}

/** The dock is part of the app, but only the dock shot is about it. */
async function hideDock(page: Page, hide = true) {
	await page.evaluate((hide) => {
		for (const el of document.querySelectorAll<HTMLElement>(
			'nav[aria-label="Primary"]',
		))
			el.style.visibility = hide ? "hidden" : "";
	}, hide);
}

async function shots(
	page: Page,
	context: BrowserContext,
	db: string,
) {
	// Two groups so the dashboard isn't empty: the Lisbon trip the balance,
	// invite and lock guides use, and a flat.
	const lisbon = await makeGroup(context, "Lisbon weekend", [
		"Arjun Mehta",
		"Mac Okafor",
	]);
	const flat = await makeGroup(context, "Flat 4B", ["Jonas Weber", "Lena Park"]);
	const everyone = lisbon.members.map((m) => m.userId);
	const sam = lisbon.member("Sam");
	await spend(context, lisbon.id, "Villa booking", 636, sam, everyone, "2026-10-10");
	await spend(context, lisbon.id, "Scooter rental", 180, lisbon.member("Arjun"), everyone, "2026-10-11");
	await spend(context, lisbon.id, "Beach shack dinner", 360, lisbon.member("Mac"), everyone, "2026-10-11");
	await spend(
		context,
		flat.id,
		"Internet",
		40,
		flat.member("Sam"),
		flat.members.map((m) => m.userId),
		"2026-10-25",
	);

	// ---- Create a group
	await open(page, "/app");
	await hideDock(page);
	await shoot(page, "dashboard", [content(page)]);
	await page.getByRole("button", { name: "New group" }).first().click();
	const start = dialog(page, "Start a group");
	await start.getByLabel("Group name", { exact: true }).fill("Sunday dinner");
	await shoot(page, "group-name", [start]);
	await start.getByRole("button", { name: "Continue" }).click();
	for (const email of ["mac@example.com", "priya@example.com"]) {
		await start.getByPlaceholder("friend@example.com").fill(email);
		await start.getByRole("button", { name: "Add invitation" }).click();
	}
	await shoot(page, "group-people", [start]);
	await start.getByRole("button", { name: "Continue" }).click();
	await shoot(page, "group-review", [start]);
	await start.getByRole("button", { name: "Create group" }).click();
	await page.getByRole("heading", { name: "Sunday dinner" }).waitFor();
	// Mac and Priya accept their invites, so the group has three members to
	// split with, as it would a day later.
	const dinnerId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
	const invites = await api<{ id: string; email: string }[]>(
		context,
		"GET",
		`/groups/${dinnerId}/invitations`,
	);
	for (const [email, name] of [
		["mac@example.com", "Mac Okafor"],
		["priya@example.com", "Priya Nair"],
	]) {
		const invite = invites.find((row) => row.email === email);
		if (!invite) throw new Error(`No invite for ${email}`);
		const guest = await page.context().browser()?.newContext();
		if (!guest) throw new Error("No browser");
		await account(guest, db, name, email);
		await api(guest, "POST", `/invitations/${invite.id}/accept`, {});
		await guest.close();
	}
	await open(page, `/app/groups/${dinnerId}`);
	await hideDock(page);

	// ---- Add an expense
	await shoot(page, "group-empty", [content(page)]);
	await page.getByRole("button", { name: "Add expense" }).first().click();
	const composer = dialog(page, "Add an expense");
	await composer.getByLabel("Description").fill("Groceries");
	await composer
		.locator("[data-slot=select-trigger]", { hasText: "Currency" })
		.click();
	await page.getByRole("option", { name: /EUR/ }).click();
	await composer.getByLabel("Amount").fill("48.60");
	await shoot(page, "expense-details", [composer]);
	await composer.getByRole("button", { name: "Continue" }).click();
	await shoot(page, "expense-split", [composer]);
	await composer.getByRole("button", { name: "Add expense" }).click();
	await closed(composer);

	// ---- The dock's plus: a menu outside a group (inside one it adds an
	// expense straight away)
	await open(page, "/app");
	await page.getByRole("button", { name: "New expense or group" }).click();
	const menu = page.getByRole("menu");
	await menu.waitFor();
	await shoot(page, "compose-menu", [menu, page.locator('nav[aria-label="Primary"]')], 32);
	await page.keyboard.press("Escape");

	// ---- Invite people
	await open(page, `/app/groups/${lisbon.id}`);
	await hideDock(page);
	await page.getByRole("tab", { name: "Members" }).click();
	await shoot(page, "invite-members", [content(page)]);
	await page.getByRole("button", { name: "Add person" }).click();
	const add = dialog(page, "Add a person");
	await add.getByLabel("Name").fill("Lena Park");
	await add.getByLabel("Email").fill("lena@example.com");
	await shoot(page, "invite-add", [add]);
	await add.getByRole("button", { name: "Add & invite" }).click();
	const share = dialog(page, "Share the invite");
	const link = share.locator("#invite-url");
	await link.waitFor();
	await link.evaluate((input: HTMLInputElement, shown) => {
		const url = new URL(input.value);
		input.value = `${shown}${url.pathname}`;
	}, SHOWN_ORIGIN);
	await shoot(page, "invite-share", [share]);
	await page.keyboard.press("Escape");
	await closed(share);

	// ---- Settle up
	await open(page, `/app/groups/${lisbon.id}`);
	await hideDock(page);
	await page.getByRole("tab", { name: "Balances" }).click();
	const balances = page.getByRole("tabpanel");
	await balances.getByText("Simplified debts").waitFor();
	await shoot(page, "settle-balances", [balances.locator(":scope > *")]);
	await balances
		.locator("[data-slot=item]", { hasText: "Arjun Mehta" })
		.getByRole("button", { name: "Record payment" })
		.click();
	const record = dialog(page, "Record a payment");
	await shoot(page, "settle-dialog", [record]);
	await record.getByRole("button", { name: "Record payment", exact: true }).click();
	await closed(record);
	await balances.getByText("Arjun Mehta paid").first().waitFor().catch(() => {});
	await shoot(page, "settle-history", [balances.locator(":scope > *")]);

	// ---- Locked expenses: a fresh expense, so the payment above didn't lock it
	const movie = await spend(context, lisbon.id, "Movie night", 36, sam, everyone, "2026-10-12");
	await open(page, `/app/groups/${lisbon.id}/expenses/${movie.id}`);
	await hideDock(page);
	await shoot(page, "lock-shares", [content(page)]);
	await page
		.getByRole("checkbox", { name: /Arjun Mehta/ })
		.first()
		.click();
	await page.getByText(/locked/i).first().waitFor();
	await shoot(page, "lock-locked", [content(page)]);
	await open(page, `/app/groups/${lisbon.id}`);
	await hideDock(page);
	await page.getByRole("tab", { name: "Expenses" }).click();
	await shoot(page, "lock-list", [page.getByRole("tabpanel").locator(":scope > *")]);
}

/* -------------------------------------------------------------------- main */

async function main() {
	const server = REUSE
		? {
				file: process.env.E2E_DB_FILE ?? "",
				ready: async () => {},
				stop: () => {},
			}
		: startServer();
	const browser = await chromium.launch();
	try {
		await server.ready();
		const context = await browser.newContext({
			viewport: { width: 1280, height: 1100 },
			deviceScaleFactor: 2,
			colorScheme: "light",
			reducedMotion: "reduce",
		});
		const page = await context.newPage();
		// Reusing a dev server, a fresh address per run starts clean too.
		const email = REUSE ? `sam-${Date.now()}@example.com` : "sam@example.com";
		await account(context, server.file, "Sam Rivera", email);
		await shots(page, context, server.file);
	} finally {
		await browser.close();
		server.stop();
	}
}

await main();
