import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "better-auth/crypto";
import * as schema from "../../src/db/schema";
import { paginationFixture } from "../../src/server/services/pagination-fixture";

// A fresh migrated database per run. Never read or modify the developer's DB.
const directory = await mkdtemp(join(tmpdir(), "eventual-e2e-"));
const url = `file:${join(directory, "test.db")}`;
const { db, client, at } = await paginationFixture(96, url);
await db.insert(schema.user).values({
	id: "outsider",
	name: "Outsider",
	email: "outsider@pagination.invalid",
	emailVerified: true,
	createdAt: at,
	updatedAt: at,
});
const password = await hashPassword("pagination-test-password");
await db.insert(schema.account).values(
	["A", "outsider"].map((id) => ({
		id: `credential-${id}`,
		accountId: id,
		userId: id,
		providerId: "credential",
		password,
		createdAt: at,
		updatedAt: at,
	})),
);
const events = Array.from({ length: 60 }, (_, i) => ({
	id: `activity-${String(i).padStart(3, "0")}`,
	organizationId: "G",
	actorUserId: "A",
	type: "group.created" as const,
	targetType: "group",
	targetId: "G",
	createdAt: new Date(at.getTime() + Math.floor(i / 3) * 1000),
}));
await db.insert(schema.activity).values(events);
await db.insert(schema.activityRecipient).values(
	events.map((event) => ({
		activityId: event.id,
		userId: "A",
		createdAt: event.createdAt,
	})),
);
await db.insert(schema.settlement).values(
	events.map((event, i) => ({
		id: `settlement-${String(i).padStart(3, "0")}`,
		organizationId: "G",
		fromUserId: "A",
		toUserId: "B",
		createdByUserId: "A",
		amountMinor: 1,
		currency: "USD",
		note: `Test payment ${i}`,
		createdAt: event.createdAt,
	})),
);
client.close();

// Empty values override .env.local so the test server cannot send production telemetry/mail.
const env = { ...process.env };
for (const key of [
	"TURSO_AUTH_TOKEN",
	"RESEND_API_KEY",
	"EMAIL_FROM",
	"SENTRY_DSN",
	"SENTRY_AUTH_TOKEN",
	"POSTHOG_PROJECT_TOKEN",
	"VITE_SENTRY_DSN",
	"VITE_POSTHOG_PROJECT_TOKEN",
	"GOOGLE_CLIENT_ID",
	"GOOGLE_CLIENT_SECRET",
])
	env[key] = "";
Object.assign(env, {
	TURSO_DATABASE_URL: url,
	BETTER_AUTH_SECRET: "e2e-only-secret-at-least-thirty-two-characters",
	BETTER_AUTH_URL: "http://127.0.0.1:3107",
});
const server = spawn(
	process.execPath,
	[
		"node_modules/vite/bin/vite.js",
		"--host",
		"127.0.0.1",
		"--port",
		"3107",
		"--strictPort",
		"--mode",
		"test",
		"--logLevel",
		"error",
	],
	{ env, stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
	process.on(signal, () => server.kill(signal));
server.on("exit", async (code) => {
	await rm(directory, { recursive: true, force: true });
	process.exit(code ?? 0);
});
