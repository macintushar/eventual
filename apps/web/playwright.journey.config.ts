import { defineConfig, devices } from "@playwright/test";

if (!process.env.E2E_DB_FILE || !process.env.TURSO_DATABASE_URL?.startsWith("file:"))
	throw new Error("Run journey tests through `bun run test:e2e:journey` (disposable local DB required)");

export default defineConfig({
	testDir: "./e2e",
	timeout: 180_000,
	expect: { timeout: 10_000 },
	workers: 1,
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: "http://127.0.0.1:4173",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "bun run dev -- --host 127.0.0.1 --port 4173 --strictPort",
		url: "http://127.0.0.1:4173/api/v1/health",
		timeout: 120_000,
		reuseExistingServer: false,
		env: {
			TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
			TURSO_AUTH_TOKEN: "",
			BETTER_AUTH_URL: "http://127.0.0.1:4173",
			BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
			RESEND_API_KEY: "",
			EMAIL_FROM: "",
		},
	},
});
