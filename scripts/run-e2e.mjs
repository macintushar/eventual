import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "eventual-e2e-"));
const database = join(directory, "test.db");
const env = {
	...process.env,
	TURSO_DATABASE_URL: `file:${database}`,
	TURSO_AUTH_TOKEN: "",
	E2E_DB_FILE: database,
	E2E: "1",
	BETTER_AUTH_URL: "http://127.0.0.1:4173",
	BETTER_AUTH_SECRET: "e2e-disposable-secret-not-for-production-000001",
	RESEND_API_KEY: "",
	EMAIL_FROM: "",
	GOOGLE_CLIENT_ID: "",
	GOOGLE_CLIENT_SECRET: "",
	POSTHOG_PROJECT_TOKEN: "",
	VITE_POSTHOG_PROJECT_TOKEN: "",
	SENTRY_DSN: "",
	VITE_SENTRY_DSN: "",
};

try {
	const migration = spawnSync("bun", ["run", "db:migrate"], {
		env,
		stdio: "inherit",
	});
	if (migration.error) throw migration.error;
	if (migration.status !== 0) process.exitCode = migration.status ?? 1;
	else {
		const tests = spawnSync(
			"bunx",
			[
				"playwright",
				"test",
				"--config=playwright.journey.config.ts",
				...process.argv.slice(2),
			],
			{
				env,
				stdio: "inherit",
			},
		);
		if (tests.error) throw tests.error;
		process.exitCode = tests.status ?? 1;
	}
} finally {
	rmSync(directory, { recursive: true, force: true });
}
