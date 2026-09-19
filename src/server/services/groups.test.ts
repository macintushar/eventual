import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import { createGroup, listGroupsWithMembers } from "#/server/services/app";
import {
	archiveGroup,
	duplicateGroup,
	unarchiveGroup,
} from "#/server/services/groups";

async function fixture() {
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "/tmp/opencode/drizzle-tmp" });
	const now = new Date();
	const users = ["A", "B"].map((id) => ({
		id,
		name: id,
		email: `${id}@test.invalid`,
		emailVerified: true,
		image: null,
		createdAt: now,
		updatedAt: now,
	}));
	await db.insert(schema.user).values(users);
	await db.insert(schema.organization).values({
		id: "G",
		name: "Trip",
		slug: "trip",
		createdAt: now,
	});
	await db.insert(schema.member).values([
		{
			id: "member-A",
			organizationId: "G",
			userId: "A",
			role: "owner",
			weight: 2,
			createdAt: now,
		},
		{
			id: "member-B",
			organizationId: "G",
			userId: "B",
			role: "member",
			weight: 3,
			createdAt: now,
		},
	]);
	await db.insert(schema.expense).values({
		id: "E1",
		organizationId: "G",
		description: "Dinner",
		amountMinor: 20000,
		currency: "INR",
		paidByUserId: "B",
		splitMethod: "even",
		date: now,
		createdByUserId: "A",
		createdAt: now,
		updatedAt: now,
	});
	const ctx: Ctx = {
		db,
		user: users[0],
		apiKeyId: "test",
		session: {
			id: "test",
			userId: "A",
			token: "test",
			expiresAt: now,
			createdAt: now,
			updatedAt: now,
			activeOrganizationId: "G",
			ipAddress: null,
			userAgent: null,
		},
	};
	return { client, db, ctx };
}

test("archive and unarchive require owner/admin and toggle the flag", async () => {
	const f = await fixture();
	try {
		const archived = await archiveGroup(f.ctx, { groupId: "G" });
		assert.ok(archived.archivedAt);
		await assert.rejects(
			archiveGroup(f.ctx, { groupId: "G" }),
			/already archived/,
		);
		const reopened = await unarchiveGroup(f.ctx, { groupId: "G" });
		assert.equal(reopened.archivedAt, null);
		await assert.rejects(
			unarchiveGroup(f.ctx, { groupId: "G" }),
			/not archived/,
		);
	} finally {
		f.client.close();
	}
});

test("duplicate copies members and weights, makes the caller owner, and copies no expenses", async () => {
	const f = await fixture();
	try {
		const copy = await duplicateGroup(f.ctx, { groupId: "G" });
		assert.notEqual(copy.id, "G");
		assert.equal(copy.name, "Trip (copy)");
		assert.equal(copy.myRole, "owner");
		const copyMembers = await f.db
			.select()
			.from(schema.member)
			.where(eq(schema.member.organizationId, copy.id));
		assert.deepEqual(
			copyMembers
				.map(({ userId, role, weight }) => ({ userId, role, weight }))
				.sort((x, y) => x.userId.localeCompare(y.userId)),
			[
				{ userId: "A", role: "owner", weight: 2 },
				{ userId: "B", role: "member", weight: 3 },
			],
		);
		const copyExpenses = await f.db.query.expense.findMany({
			where: eq(schema.expense.organizationId, copy.id),
		});
		assert.equal(copyExpenses.length, 0);
		const copySettlements = await f.db.query.settlement.findMany();
		assert.equal(copySettlements.length, 0);
	} finally {
		f.client.close();
	}
});

test("archived groups stay out of the composer but keep data readable", async () => {
	const f = await fixture();
	try {
		assert.equal((await listGroupsWithMembers(f.ctx)).length, 1);
		await archiveGroup(f.ctx, { groupId: "G" });
		assert.equal((await listGroupsWithMembers(f.ctx)).length, 0);
		const stayReadable = await f.db.query.expense.findMany({
			where: eq(schema.expense.organizationId, "G"),
		});
		assert.equal(stayReadable.length, 1);
		await unarchiveGroup(f.ctx, { groupId: "G" });
		assert.equal((await listGroupsWithMembers(f.ctx)).length, 1);
	} finally {
		f.client.close();
	}
});

test("duplicate writes the group.duplicated activity", async () => {
	const f = await fixture();
	try {
		const copy = await duplicateGroup(f.ctx, { groupId: "G" });
		const rows = await f.db.query.activity.findMany({
			where: eq(schema.activity.organizationId, copy.id),
		});
		assert.equal(rows.length, 1);
		assert.equal(rows[0]?.type, "group.duplicated");
		assert.equal(rows[0]?.actorUserId, "A");
	} finally {
		f.client.close();
	}
});

test("createGroup still works and appears for the composer", async () => {
	const f = await fixture();
	try {
		const group = await createGroup(f.ctx, { name: "Another" });
		assert.equal(group.name, "Another");
		assert.equal(group.myRole, "owner");
		assert.equal((await listGroupsWithMembers(f.ctx)).length, 2);
	} finally {
		f.client.close();
	}
});
