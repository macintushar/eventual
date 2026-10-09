import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import { createExpense, leaveGroup } from "#/server/services/app";

async function fixture() {
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "./drizzle" });
	const now = new Date();
	const users = ["A", "B", "G1"].map((id) => ({
		id,
		name: id,
		email: `${id}@test.invalid`,
		emailVerified: true,
		image: null,
		isGuest: id === "G1",
		createdAt: now,
		updatedAt: now,
	}));
	await db.insert(schema.user).values(users);
	await db
		.insert(schema.organization)
		.values({ id: "G", name: "Trip", slug: "trip", createdAt: now });
	await db.insert(schema.member).values(
		users.map((user, index) => ({
			id: `member-${user.id}`,
			organizationId: "G",
			userId: user.id,
			role: index === 0 ? "owner" : "member",
			createdAt: now,
		})),
	);
	const as = (index: number): Ctx => ({
		db,
		user: users[index],
		apiKeyId: "test",
		apiKeyPermissions: null,
		session: {
			id: "test",
			userId: users[index].id,
			token: "test",
			expiresAt: now,
			createdAt: now,
			updatedAt: now,
			activeOrganizationId: "G",
			ipAddress: null,
			userAgent: null,
		},
	});
	const roleOf = async (userId: string) =>
		(
			await db.query.member.findFirst({
				where: and(
					eq(schema.member.organizationId, "G"),
					eq(schema.member.userId, userId),
				),
			})
		)?.role;
	return { client, as, roleOf, now };
}

test("an owner must name another real member to inherit the group", async () => {
	const f = await fixture();
	try {
		await assert.rejects(leaveGroup(f.as(0), { groupId: "G" }), /new owner/);
		await assert.rejects(
			leaveGroup(f.as(0), { groupId: "G", newOwnerId: "A" }),
			/another member/,
		);
		await assert.rejects(
			leaveGroup(f.as(0), { groupId: "G", newOwnerId: "G1" }),
			/another member/,
		);
		assert.equal(await f.roleOf("A"), "owner");

		await leaveGroup(f.as(0), { groupId: "G", newOwnerId: "B" });
		assert.equal(await f.roleOf("A"), undefined);
		assert.equal(await f.roleOf("B"), "owner");
	} finally {
		f.client.close();
	}
});

test("an owner with an open balance cannot hand over and leave", async () => {
	const f = await fixture();
	try {
		await createExpense(f.as(0), {
			groupId: "G",
			description: "Dinner",
			amountMinor: 1000,
			currency: "INR",
			paidByUserId: "A",
			splitMethod: "even",
			date: f.now,
			participants: [{ userId: "B", input: null }],
		});
		await assert.rejects(
			leaveGroup(f.as(0), { groupId: "G", newOwnerId: "B" }),
			/Settle/,
		);
		// Nothing changed: the failed leave must not have promoted B.
		assert.equal(await f.roleOf("A"), "owner");
		assert.equal(await f.roleOf("B"), "member");
	} finally {
		f.client.close();
	}
});

test("members leave without naming anyone", async () => {
	const f = await fixture();
	try {
		await leaveGroup(f.as(1), { groupId: "G" });
		assert.equal(await f.roleOf("B"), undefined);
		assert.equal(await f.roleOf("A"), "owner");
	} finally {
		f.client.close();
	}
});
