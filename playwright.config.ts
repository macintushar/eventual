import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	timeout: 45_000,
	expect: { timeout: 10_000 },
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: "http://127.0.0.1:3107",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		serviceWorkers: "block",
	},
	projects: [
		{ name: "setup", testMatch: /auth\.setup\.ts/ },
		{
			name: "api",
			testMatch: /api(-keys)?\.spec\.ts/,
			dependencies: ["setup"],
			use: { storageState: "test-results/auth.json" },
		},
		{
			name: "chromium",
			testMatch: /ui\.spec\.ts/,
			dependencies: ["setup"],
			use: {
				...devices["Desktop Chrome"],
				storageState: "test-results/auth.json",
			},
		},
		{
			name: "mobile",
			testMatch: /ui\.spec\.ts/,
			dependencies: ["setup"],
			use: { ...devices["Pixel 7"], storageState: "test-results/auth.json" },
		},
	],
	webServer: {
		command: "bunx tsx tests/e2e/server.ts",
		url: "http://127.0.0.1:3107/api/v1/health",
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
