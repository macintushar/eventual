import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { pushTypes, registerPushDeviceSchema } from "@eventual/schemas/push";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import { env } from "#/env";
import type { Ctx } from "./context";
import { expenseRecipients, updatedExpenseRecipients } from "./domain/activity";
import {
	defaultPushPreferences,
	pushCopy,
	pushRecipients,
} from "./domain/push";
import { claimJob, runJobs } from "./jobs";
import { enqueueActivityPush, executePush } from "./push";
import { pushCapability } from "./push-config";
import {
	apnsPayload,
	createPushSender,
	fcmPayload,
	PushDeliveryError,
	pushThread,
} from "./push-sender";
import {
	deletePushDevice,
	getPushPreferences,
	listPushDevices,
	registerPushDevice,
	updatePushPreferences,
} from "./services/push";

const config = { FCM_PROJECT_ID: "test", FCM_SERVICE_ACCOUNT: "configured" };
const data = {
	origin: "https://example.com",
	userId: "b",
	groupId: "g",
	expenseId: "e",
	type: "expense.created" as const,
};
const message = { body: "Actor added an expense in Group.", data };

async function fixture() {
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "drizzle" });
	const now = new Date();
	const users = await db
		.insert(schema.user)
		.values(
			["a", "b", "c"].map((id) => ({
				id,
				name: id === "a" ? "Actor" : id,
				email: `${id}@example.com`,
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			})),
		)
		.returning();
	await db
		.insert(schema.organization)
		.values({ id: "g", name: "Group", slug: "g", createdAt: now });
	await db.insert(schema.member).values(
		users.map((u) => ({
			id: `m${u.id}`,
			userId: u.id,
			organizationId: "g",
			role: "member",
			createdAt: now,
		})),
	);
	await db.insert(schema.pushDevice).values(
		users.map((u) => ({
			id: `d${u.id}`,
			userId: u.id,
			platform: "android" as const,
			token: `token-${u.id}`,
			appVersion: "1",
			locale: "en",
			createdAt: now,
			lastSeenAt: now,
		})),
	);
	const ctx = (id: string) =>
		({
			db,
			user: users.filter((u) => u.id === id)[0],
			apiKeyId: null,
			apiKeyPermissions: null,
			session: {
				id: "s",
				userId: id,
				token: "s",
				expiresAt: now,
				createdAt: now,
				updatedAt: now,
				ipAddress: null,
				userAgent: null,
				activeOrganizationId: "g",
			},
		}) satisfies Ctx;
	const row = (
		type: typeof schema.activity.$inferInsert.type = "expense.created",
		metadata = "{}",
	) => ({
		id: crypto.randomUUID(),
		organizationId: "g",
		actorUserId: "a",
		type,
		targetType: "expense",
		targetId: "e",
		metadata,
		createdAt: now,
	});
	return { db, client, ctx, row };
}

test("capability is absent without complete credentials; native tokens only", () => {
	assert.deepEqual(pushCapability({}), { available: false, via: "none" });
	assert.equal(pushCapability({ APNS_KEY_ID: "partial" }).available, false);
	assert.deepEqual(pushCapability(config), { available: true, via: "direct" });
	for (const token of ["ExpoPushToken[test]", "ExponentPushToken[test]"])
		assert.equal(
			registerPushDeviceSchema.safeParse({
				platform: "android",
				token,
				appVersion: "1",
				locale: "en",
			}).success,
			false,
		);
});

test("feed recipients, edit removals, category preferences, mutes and actor exclusion", () => {
	const before = expenseRecipients("a", 100, [
		{ userId: "b", amountMinor: 100 },
	]);
	const after = expenseRecipients("a", 100, [
		{ userId: "c", amountMinor: 100 },
	]);
	const recipients = updatedExpenseRecipients(before, after);
	assert.deepEqual(
		pushRecipients(
			[...recipients, recipients[1]],
			"a",
			"g",
			"expense.updated",
			new Map(),
		),
		["c", "b"],
	);
	assert.deepEqual(
		pushRecipients(
			recipients,
			"a",
			"g",
			"expense.updated",
			new Map([
				["b", { ...defaultPushPreferences, expenses: false }],
				["c", { ...defaultPushPreferences, mutedGroupIds: ["g"] }],
			]),
		),
		[],
	);
	assert.deepEqual(
		pushRecipients(
			before,
			"a",
			"g",
			"share.marked_paid",
			new Map([["b", { ...defaultPushPreferences, payments: false }]]),
		),
		[],
	);
	assert.deepEqual(
		pushRecipients(
			before,
			"a",
			"g",
			"recurring.generated",
			new Map([["b", { ...defaultPushPreferences, expenses: false }]]),
		),
		["b"],
	);
});

test("all copy templates omit financial content and payloads route by account/server/group", () => {
	assert.deepEqual(
		pushTypes.map((type) => pushCopy(type, "Actor", "Group")),
		[
			"Actor added an expense in Group.",
			"Actor updated an expense in Group.",
			"Actor deleted an expense in Group.",
			"Actor recorded a payment in Group.",
			"Actor deleted a payment in Group.",
			"Actor marked a share paid in Group.",
			"Actor marked a share unpaid in Group.",
			"A recurring expense was added in Group.",
		],
	);
	const apns = apnsPayload(message);
	assert.deepEqual(apns.aps.alert, { title: "Eventual", body: message.body });
	assert.equal(apns.aps["thread-id"], pushThread(data));
	const fcm = fcmPayload("token", message).message;
	assert.deepEqual(fcm.data, data);
	assert.equal(fcm.android.collapse_key, pushThread(data));
	assert.notEqual(pushThread(data), pushThread({ ...data, userId: "a" }));
});

test("transactional fan-out deduplicates, applies mutes, marks recurring and skips unconfigured servers", async () => {
	const f = await fixture();
	try {
		await updatePushPreferences(f.ctx("c"), { mutedGroupIds: ["g"] });
		const row = f.row();
		const recipients = ["a", "b", "b", "c"].map((userId) => ({
			userId,
			deltaMinor: null,
		}));
		await enqueueActivityPush(f.db, row, recipients, {});
		assert.equal((await f.db.select().from(schema.job)).length, 0);
		await enqueueActivityPush(f.db, row, recipients, config);
		await enqueueActivityPush(f.db, row, recipients, config);
		const jobs = await f.db.select().from(schema.job);
		assert.equal(jobs.length, 1);
		assert.deepEqual(JSON.parse(jobs[0].payload), {
			body: message.body,
			data: { ...data, origin: new URL(env.BETTER_AUTH_URL).origin },
			deviceIds: ["db"],
		});
		await enqueueActivityPush(
			f.db,
			f.row("expense.created", '{"recurring":true}'),
			recipients,
			config,
		);
		assert.equal(
			JSON.parse((await f.db.select().from(schema.job))[1].payload).data.type,
			"recurring.generated",
		);
	} finally {
		f.client.close();
	}
});

test("devices retry independently, invalid tokens are removed, and sign-out or reassignment skips queued sends", async () => {
	const f = await fixture();
	try {
		await registerPushDevice(
			f.ctx("b"),
			{ platform: "android", token: "second-b", appVersion: "1", locale: "en" },
			config,
		);
		await enqueueActivityPush(
			f.db,
			f.row(),
			[{ userId: "b", deltaMinor: null }],
			config,
		);
		const parent = await claimJob(f.db);
		assert.ok(parent);
		await executePush(f.db, parent, async () => {
			throw new Error("parent must not send");
		});
		let calls = 0;
		let successfulCalls = 0;
		const handler = (db: typeof f.db, job: typeof schema.job.$inferSelect) =>
			executePush(db, job, async (device) => {
				if (device.token === "second-b") {
					successfulCalls++;
					return "sent";
				}
				calls++;
				if (calls === 1) throw new PushDeliveryError("FCM", 503);
				return "invalid";
			});
		assert.deepEqual(await runJobs(f.db, { handler }), {
			completed: 1,
			failed: 1,
		});
		assert.deepEqual(
			await runJobs(f.db, { handler, now: new Date(Date.now() + 61_000) }),
			{ completed: 1, failed: 0 },
		);
		assert.equal((await listPushDevices(f.ctx("b"))).length, 1);
		assert.equal(successfulCalls, 1);
		await enqueueActivityPush(
			f.db,
			f.row(),
			[{ userId: "c", deltaMinor: null }],
			config,
		);
		await deletePushDevice(f.ctx("c"), "dc");
		await runJobs(f.db, {
			handler: (db, job) =>
				executePush(db, job, async () => {
					throw new Error("signed out");
				}),
		});
	} finally {
		f.client.close();
	}
});

test("preferences default on, partial updates preserve categories and reject unrelated group mutes", async () => {
	const f = await fixture();
	try {
		assert.deepEqual(
			await getPushPreferences(f.ctx("b")),
			defaultPushPreferences,
		);
		await updatePushPreferences(f.ctx("b"), { expenses: false });
		assert.deepEqual(
			await updatePushPreferences(f.ctx("b"), { recurring: false }),
			{ ...defaultPushPreferences, expenses: false, recurring: false },
		);
		await assert.rejects(
			updatePushPreferences(f.ctx("b"), {
				payments: false,
				mutedGroupIds: ["foreign"],
			}),
		);
		assert.equal((await getPushPreferences(f.ctx("b"))).payments, true);
		await assert.rejects(listPushDevices({ ...f.ctx("b"), apiKeyId: "key" }));
	} finally {
		f.client.close();
	}
});

test("departed group mutes are hidden and cached stale mutes do not block current changes", async () => {
	const f = await fixture();
	try {
		await updatePushPreferences(f.ctx("b"), { mutedGroupIds: ["g"] });
		await f.db.delete(schema.member).where(eq(schema.member.userId, "b"));
		assert.deepEqual((await getPushPreferences(f.ctx("b"))).mutedGroupIds, []);
		await f.db
			.insert(schema.organization)
			.values({ id: "new", name: "New", slug: "new", createdAt: new Date() });
		await f.db.insert(schema.member).values({
			id: "new-b",
			userId: "b",
			organizationId: "new",
			role: "member",
			createdAt: new Date(),
		});
		assert.deepEqual(
			(await updatePushPreferences(f.ctx("b"), { mutedGroupIds: ["g", "new"] }))
				.mutedGroupIds,
			["new"],
		);
		assert.deepEqual(
			(await updatePushPreferences(f.ctx("b"), { mutedGroupIds: [] }))
				.mutedGroupIds,
			[],
		);
		await assert.rejects(
			updatePushPreferences(f.ctx("b"), { mutedGroupIds: ["g"] }),
		);
	} finally {
		f.client.close();
	}
});

test("outbox rolls back with domain writes and delivery rechecks preferences and membership", async () => {
	const f = await fixture();
	try {
		await assert.rejects(
			f.db.transaction(async (tx) => {
				await enqueueActivityPush(
					tx,
					f.row(),
					[{ userId: "b", deltaMinor: null }],
					config,
				);
				throw new Error("domain write rolled back");
			}),
		);
		assert.equal((await f.db.select().from(schema.job)).length, 0);
		await enqueueActivityPush(
			f.db,
			f.row(),
			[{ userId: "b", deltaMinor: null }],
			config,
		);
		const parent = await claimJob(f.db);
		assert.ok(parent);
		await executePush(f.db, parent);
		await updatePushPreferences(f.ctx("b"), { expenses: false });
		const noSend = async () => {
			throw new Error("delivery should be skipped");
		};
		assert.deepEqual(
			await runJobs(f.db, {
				handler: (db, job) => executePush(db, job, noSend),
			}),
			{ completed: 1, failed: 0 },
		);
		await enqueueActivityPush(
			f.db,
			f.row(),
			[{ userId: "c", deltaMinor: null }],
			config,
		);
		await f.db.delete(schema.member).where(eq(schema.member.userId, "c"));
		assert.deepEqual(
			await runJobs(f.db, {
				handler: (db, job) => executePush(db, job, noSend),
			}),
			{ completed: 1, failed: 0 },
		);
	} finally {
		f.client.close();
	}
});

test("registry refreshes by token, reassigns ownership and fences old sign-out handles", async () => {
	const f = await fixture();
	try {
		const input = {
			platform: "android",
			token: "token-b",
			appVersion: "2",
			locale: "en-IN",
		};
		const refreshed = await registerPushDevice(f.ctx("b"), input, config);
		assert.equal(refreshed.id, "db");
		assert.equal(refreshed.appVersion, "2");
		assert.equal("token" in refreshed, false);
		await enqueueActivityPush(
			f.db,
			f.row(),
			[{ userId: "b", deltaMinor: null }],
			config,
		);
		const reassigned = await registerPushDevice(f.ctx("c"), input, config);
		assert.notEqual(reassigned.id, refreshed.id);
		await deletePushDevice(f.ctx("b"), refreshed.id);
		assert.equal((await listPushDevices(f.ctx("c"))).length, 2);
		await runJobs(f.db, {
			handler: (db, job) =>
				executePush(db, job, async () => {
					throw new Error("must not notify new owner");
				}),
		});
	} finally {
		f.client.close();
	}
});

test("injectable APNs and FCM transports classify invalid tokens and respect retry-after", async () => {
	const ec = generateKeyPairSync("ec", { namedCurve: "P-256" })
		.privateKey.export({ type: "pkcs8", format: "pem" })
		.toString();
	const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
		.privateKey.export({ type: "pkcs8", format: "pem" })
		.toString();
	for (const reason of ["BadDeviceToken", "Unregistered"]) {
		const send = createPushSender(
			{
				APNS_KEY_ID: "key",
				APNS_TEAM_ID: "team",
				APNS_PRIVATE_KEY: ec,
				APNS_BUNDLE_ID: "app",
				APNS_ENVIRONMENT: "sandbox",
			},
			{
				http: async () => {
					throw new Error();
				},
				apns: async (request) => {
					assert.ok(request.url.includes("sandbox"));
					return { status: 400, body: { reason } };
				},
			},
		);
		assert.equal(
			await send({ platform: "ios", token: "abc" }, message),
			"invalid",
		);
	}
	let status = 404;
	const send = createPushSender(
		{
			FCM_PROJECT_ID: "test",
			FCM_SERVICE_ACCOUNT: JSON.stringify({
				client_email: "test@example.com",
				private_key: rsa,
			}),
		},
		{
			apns: async () => {
				throw new Error();
			},
			http: async (request) =>
				request.url.includes("oauth2")
					? { status: 200, body: { access_token: "test", expires_in: 3600 } }
					: {
							status,
							body: {
								error: {
									details: [
										{
											"@type":
												"type.googleapis.com/google.firebase.fcm.v1.FcmError",
											errorCode: "UNREGISTERED",
										},
									],
								},
							},
							retryAfter: "120",
						},
		},
	);
	assert.equal(
		await send({ platform: "android", token: "test" }, message),
		"invalid",
	);
	status = 503;
	const retry = createPushSender(
		{
			APNS_KEY_ID: "key",
			APNS_TEAM_ID: "team",
			APNS_PRIVATE_KEY: ec,
			APNS_BUNDLE_ID: "app",
			APNS_ENVIRONMENT: "production",
		},
		{
			http: async () => {
				throw new Error();
			},
			apns: async () => ({ status: 503, body: {}, retryAfter: "120" }),
		},
	);
	await assert.rejects(
		retry({ platform: "ios", token: "test" }, message),
		(error: unknown) =>
			error instanceof PushDeliveryError &&
			!!error.retryAt &&
			+error.retryAt >= Date.now() + 119_000,
	);
});
