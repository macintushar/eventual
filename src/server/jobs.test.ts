import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "./context";
import {
	claimJob,
	completeJob,
	enqueueJob,
	failJob,
	JOB_LEASE_MS,
	MAX_JOB_ATTEMPTS,
	runJobs,
	runJobsRequest,
} from "./jobs";
import { createNotifier } from "./notifier";
import {
	createRecurringExpense,
	materializeRecurringExpense,
	nextRecurrence,
	updateRecurringExpense,
} from "./services/recurring";
import { executeReminder } from "./services/reminders";

async function fixture() {
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "drizzle" });
	// The parent task owns migrations; exercise the agreed schema before they land.
	for (const [table, name, declaration] of [
		["user", "email_reminders", "integer NOT NULL DEFAULT 1"],
		["user", "is_guest", "integer NOT NULL DEFAULT 0"],
		["user", "claimed_at", "integer"],
		["organization", "archived_at", "integer"],
		["member", "weight", "integer NOT NULL DEFAULT 1"],
		["expense", "category", "text"],
	]) {
		const columns = await client.execute(`PRAGMA table_info(${table})`);
		if (!columns.rows.some((row) => row.name === name))
			await client.execute(
				`ALTER TABLE ${table} ADD COLUMN ${name} ${declaration}`,
			);
	}
	await client.execute(
		"CREATE TABLE IF NOT EXISTS job (id text PRIMARY KEY, due_at integer NOT NULL, kind text NOT NULL, payload text NOT NULL, attempts integer NOT NULL DEFAULT 0, locked_at integer, lock_token text, completed_at integer, last_error text, dedupe_key text UNIQUE)",
	);
	await client.execute(
		"CREATE TABLE IF NOT EXISTS expense_template (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organization(id), created_by_user_id text NOT NULL REFERENCES user(id), recurrence text NOT NULL, next_run_at integer NOT NULL, payload text NOT NULL, active integer NOT NULL DEFAULT 1)",
	);
	const now = new Date("2026-01-31T12:30:00Z");
	const [user] = await db
		.insert(schema.user)
		.values({
			id: "u",
			name: "User",
			email: "u@example.com",
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	await db
		.insert(schema.organization)
		.values({ id: "g", name: "Group", slug: "g", createdAt: now });
	await db.insert(schema.member).values({
		id: "m",
		userId: "u",
		organizationId: "g",
		role: "owner",
		createdAt: now,
	});
	const ctx = {
		db,
		user,
		apiKeyId: null,
		session: {
			id: "test-session",
			userId: user.id,
			token: "test-token",
			expiresAt: now,
			createdAt: now,
			updatedAt: now,
			ipAddress: null,
			userAgent: "test",
			activeOrganizationId: "g",
		},
	} satisfies Ctx;
	return { client, db, ctx, now };
}

test("claims are atomic, stale tokens are fenced, retries back off and stop", async () => {
	const f = await fixture();
	try {
		const input = { kind: "test", payload: {}, dueAt: f.now, dedupeKey: "one" };
		await enqueueJob(f.db, input);
		assert.equal(await enqueueJob(f.db, input), null);
		const first = await claimJob(f.db, f.now);
		assert.ok(first);
		assert.equal(await claimJob(f.db, f.now), null);
		const recovered = await claimJob(f.db, new Date(+f.now + JOB_LEASE_MS));
		assert.ok(recovered);
		assert.notEqual(first.lockToken, recovered.lockToken);
		assert.equal((await completeJob(f.db, first)).length, 0);
		await failJob(f.db, first, new Error("stale"), f.now);
		assert.equal(
			(await f.db.query.job.findFirst())?.lockToken,
			recovered.lockToken,
		);
		await failJob(f.db, recovered, new Error("provider down"), f.now);
		assert.equal(await claimJob(f.db, new Date(+f.now + 119_999)), null);
		let now = new Date(+f.now + 120_000);
		for (let attempt = 3; attempt <= MAX_JOB_ATTEMPTS; attempt++) {
			const claimed = await claimJob(f.db, now);
			assert.ok(claimed);
			assert.equal(claimed.attempts, attempt);
			await failJob(f.db, claimed, new Error("still down"), now);
			now = new Date(+now + 60_000 * 2 ** (attempt - 1));
		}
		assert.equal(await claimJob(f.db, now), null);
		assert.equal((await f.db.query.job.findFirst())?.lastError, "still down");
	} finally {
		f.client.close();
	}
});

test("runner retries an ambiguous email delivery with the identical provider key", async () => {
	const f = await fixture();
	try {
		const keys: string[] = [];
		const notifier = createNotifier(f.db, [
			{
				channel: "email",
				async send(_address, _kind, payload) {
					keys.push(payload.idempotencyKey);
					if (keys.length === 1) throw new Error("lost response");
					return "sent";
				},
			},
		]);
		await enqueueJob(f.db, {
			kind: "test",
			dueAt: f.now,
			payload: {},
			dedupeKey: "email",
		});
		const handler = async (
			_db: typeof f.db,
			claimed: typeof schema.job.$inferSelect,
		) => {
			await notifier.send("u", "reminder", {
				idempotencyKey: `job:${claimed.id}`,
				email: {
					kind: "reminder",
					groupName: "Group",
					url: "https://example.com",
				},
			});
		};
		assert.deepEqual(await runJobs(f.db, { now: f.now, handler }), {
			completed: 0,
			failed: 1,
		});
		assert.deepEqual(
			await runJobs(f.db, { now: new Date(+f.now + 60_000), handler }),
			{ completed: 1, failed: 0 },
		);
		assert.equal(keys.length, 2);
		assert.equal(keys[0], keys[1]);
		await f.db
			.update(schema.user)
			.set({ emailReminders: false })
			.where(eq(schema.user.id, "u"));
		const completed = await f.db.query.job.findFirst();
		assert.ok(completed);
		await handler(f.db, completed);
		await f.db
			.update(schema.user)
			.set({ emailReminders: true, email: "guest.x@guests.eventual.invalid" })
			.where(eq(schema.user.id, "u"));
		await handler(f.db, completed);
		assert.equal(keys.length, 2);
	} finally {
		f.client.close();
	}
});

test("UTC recurrence preserves month-end, original day, leap day and time", () => {
	for (const [start, recurrence, expected] of [
		["2026-01-31", "monthly", ["2026-02-28", "2026-03-31"]],
		["2026-01-30", "monthly", ["2026-02-28", "2026-03-30"]],
		[
			"2024-02-29",
			"yearly",
			["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"],
		],
		["2026-12-31", "daily", ["2027-01-01"]],
		["2026-12-31", "weekly", ["2027-01-07"]],
	] as const) {
		const anchor = new Date(`${start}T12:30:00Z`);
		let current = anchor;
		for (const day of expected) {
			current = nextRecurrence(current, recurrence, anchor);
			assert.equal(current.toISOString(), `${day}T12:30:00.000Z`);
		}
	}
});

test("materialization rolls back on crash, then commits expense, advance and completion once", async () => {
	const f = await fixture();
	try {
		const template = await createRecurringExpense(f.ctx, {
			groupId: "g",
			recurrence: "monthly",
			nextRunAt: f.now,
			active: true,
			payload: {
				description: "Rent",
				amountMinor: 100,
				currency: "INR",
				paidByUserId: "u",
				splitMethod: "even",
				participants: [{ userId: "u", input: null }],
			},
		});
		const claimed = await claimJob(f.db, f.now);
		assert.ok(claimed);
		await f.client.execute(
			"CREATE TRIGGER simulate_crash BEFORE UPDATE OF next_run_at ON expense_template BEGIN SELECT RAISE(ABORT, 'simulated crash'); END",
		);
		await assert.rejects(
			materializeRecurringExpense(f.db, claimed),
			(error) => {
				let current: unknown = error;
				while (current instanceof Error) {
					if (current.message.includes("simulated crash")) return true;
					current = current.cause;
				}
				return false;
			},
		);
		assert.equal((await f.db.query.expense.findMany()).length, 0);
		assert.equal((await f.db.query.job.findFirst())?.completedAt, null);
		await f.client.execute("DROP TRIGGER simulate_crash");
		await materializeRecurringExpense(f.db, claimed);
		await materializeRecurringExpense(f.db, claimed);
		assert.equal((await f.db.query.expense.findMany()).length, 1);
		assert.equal(
			(await f.db.query.expenseTemplate.findFirst())?.nextRunAt.toISOString(),
			"2026-02-28T12:30:00.000Z",
		);
		assert.ok(
			(await f.db.query.job.findFirst({ where: eq(schema.job.id, claimed.id) }))
				?.completedAt,
		);
		// Pausing consumes a due job; resuming at the same date must still enqueue work.
		await updateRecurringExpense(f.ctx, {
			templateId: template.id,
			active: false,
		});
		const next = new Date("2026-02-28T12:30:00Z");
		await runJobs(f.db, { now: next, handler: materializeRecurringExpense });
		await updateRecurringExpense(f.ctx, {
			templateId: template.id,
			active: true,
		});
		await runJobs(f.db, { now: next, handler: materializeRecurringExpense });
		assert.equal((await f.db.query.expense.findMany()).length, 2);
		await runJobs(f.db, {
			now: new Date("2026-03-31T12:30:00Z"),
			handler: materializeRecurringExpense,
		});
		assert.equal((await f.db.query.expense.findMany()).length, 3);
	} finally {
		f.client.close();
	}
});

test("reminder execution rechecks requester membership", async () => {
	const f = await fixture();
	try {
		const row = await enqueueJob(f.db, {
			kind: "reminder",
			dueAt: f.now,
			dedupeKey: "r",
			payload: {
				groupId: "g",
				userId: "u",
				requestedByUserId: "departed",
				dueAt: f.now,
			},
		});
		assert.ok(row);
		let sends = 0;
		await executeReminder(f.db, row, {
			async send() {
				sends++;
				return { skipped: false, deliveries: [] };
			},
		});
		assert.equal(sends, 0);
	} finally {
		f.client.close();
	}
});

test("cron fails closed without a runtime secret and rejects wrong credentials", async () => {
	const original = process.env.CRON_SECRET;
	try {
		delete process.env.CRON_SECRET;
		assert.equal(
			(await runJobsRequest(new Request("https://example.com/api/jobs/run")))
				.status,
			503,
		);
		process.env.CRON_SECRET = "test-secret";
		assert.equal(
			(
				await runJobsRequest(
					new Request("https://example.com/api/jobs/run", {
						method: "POST",
						headers: { authorization: "Bearer wrong" },
					}),
				)
			).status,
			401,
		);
		assert.equal(
			(
				await runJobsRequest(
					new Request("https://example.com/api/jobs/run", { method: "DELETE" }),
				)
			).status,
			405,
		);
	} finally {
		if (original === undefined) delete process.env.CRON_SECRET;
		else process.env.CRON_SECRET = original;
	}
});
