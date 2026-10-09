import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Database } from "#/db";
import { job } from "#/db/schema";
import { getAppLogger } from "#/lib/logging";

export const MAX_JOB_ATTEMPTS = 5;
export const JOB_LEASE_MS = 5 * 60_000;
// The cron fires once a day, so each run drains everything due rather than a
// fixed batch; the budget keeps it well inside the function's max duration.
export const JOB_RUN_BUDGET_MS = 50_000;
export type ClaimedJob = typeof job.$inferSelect;
export type JobHandler = (db: Database, claimed: ClaimedJob) => Promise<void>;

export async function enqueueJob(
	db: Pick<Database, "insert">,
	input: { kind: string; payload: object; dueAt: Date; dedupeKey: string },
) {
	const rows = await db
		.insert(job)
		.values({
			id: crypto.randomUUID(),
			...input,
			payload: JSON.stringify(input.payload),
		})
		.onConflictDoNothing({ target: job.dedupeKey })
		.returning();
	getAppLogger("jobs").debug("Job enqueue completed", {
		kind: input.kind,
		enqueued: rows.length > 0,
	});
	return rows[0] ?? null;
}

export function ownedJob(claimed: ClaimedJob) {
	if (!claimed.lockToken) throw new Error("Job has no claim token");
	return and(
		eq(job.id, claimed.id),
		eq(job.lockToken, claimed.lockToken),
		isNull(job.completedAt),
	);
}

export async function claimJob(db: Database, now = new Date()) {
	const eligible = and(
		isNull(job.completedAt),
		lt(job.attempts, MAX_JOB_ATTEMPTS),
		lte(job.dueAt, now),
		or(
			isNull(job.lockedAt),
			lte(job.lockedAt, new Date(now.getTime() - JOB_LEASE_MS)),
		),
	);
	const candidate = db
		.select({ id: job.id })
		.from(job)
		.where(eligible)
		.orderBy(asc(job.dueAt), asc(job.id))
		.limit(1);
	const rows = await db
		.update(job)
		.set({
			lockedAt: now,
			lockToken: crypto.randomUUID(),
			attempts: sql`${job.attempts} + 1`,
		})
		.where(and(eq(job.id, candidate), eligible))
		.returning();
	return rows[0] ?? null;
}

export async function completeJob(
	db: Pick<Database, "update">,
	claimed: ClaimedJob,
) {
	return db
		.update(job)
		.set({
			completedAt: new Date(),
			lockedAt: null,
			lockToken: null,
			lastError: null,
		})
		.where(ownedJob(claimed))
		.returning();
}

export async function failJob(
	db: Database,
	claimed: ClaimedJob,
	error: unknown,
	now = new Date(),
) {
	await db
		.update(job)
		.set({
			lockedAt: null,
			lockToken: null,
			dueAt: new Date(now.getTime() + 60_000 * 2 ** (claimed.attempts - 1)),
			lastError: (error instanceof Error ? error.message : "Job failed").slice(
				0,
				1000,
			),
		})
		.where(ownedJob(claimed));
}

async function dispatchJob(db: Database, claimed: ClaimedJob) {
	if (claimed.kind === "reminder") {
		const { executeReminder } = await import("./services/reminders");
		await executeReminder(db, claimed);
	} else if (claimed.kind === "recurring-expense") {
		const { materializeRecurringExpense } = await import(
			"./services/recurring"
		);
		await materializeRecurringExpense(db, claimed);
	} else throw new Error(`Unknown job kind: ${claimed.kind}`);
}

export async function runJobs(
	db: Database,
	options: {
		limit?: number;
		deadline?: number;
		handler?: JobHandler;
		now?: Date;
	} = {},
) {
	let completed = 0;
	let failed = 0;
	const limit = options.limit ?? 25;
	const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
	for (let i = 0; i < limit && Date.now() < deadline; i++) {
		const claimed = await claimJob(db, options.now ?? new Date());
		if (!claimed) break;
		const logger = getAppLogger("jobs").with({
			jobId: claimed.id,
			kind: claimed.kind,
			attempt: claimed.attempts,
		});
		logger.info("Job started");
		try {
			await (options.handler ?? dispatchJob)(db, claimed);
			await completeJob(db, claimed);
			completed++;
			logger.info("Job completed");
		} catch (error) {
			await failJob(db, claimed, error, options.now ?? new Date());
			failed++;
			if (claimed.attempts >= MAX_JOB_ATTEMPTS)
				logger.error("Job attempts exhausted", { error });
			else
				logger.warning("Job scheduled for retry", {
					attempt: claimed.attempts,
				});
		}
	}
	getAppLogger("jobs").info("Job run completed", { completed, failed });
	return { completed, failed };
}

export async function runJobsRequest(request: Request) {
	if (request.method !== "GET" && request.method !== "POST")
		return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
	const secret =
		typeof process === "undefined" ? undefined : process.env.CRON_SECRET;
	if (!secret)
		return Response.json({ error: "Cron is not configured" }, { status: 503 });
	const expected = Buffer.from(`Bearer ${secret}`);
	const actual = Buffer.from(request.headers.get("authorization") ?? "");
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	const { db } = await import("#/db");
	const result = await runJobs(db, {
		limit: Number.POSITIVE_INFINITY,
		deadline: Date.now() + JOB_RUN_BUDGET_MS,
	});
	return Response.json(result, {
		headers: { "Cache-Control": "no-store" },
	});
}
