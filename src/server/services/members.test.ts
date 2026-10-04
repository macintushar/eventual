import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import { channelIdentity } from "#/db/schema";
import type { Ctx } from "#/server/context";
import { listMembers } from "#/server/services/members";

const NUMBER = "+919876543210";

async function fixture() {
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "./drizzle" });
	const now = new Date();
	await db.insert(schema.user).values(
		["A", "B"].map((id) => ({
			id,
			name: id,
			email: `${id.toLowerCase()}@test.invalid`,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		})),
	);
	await db.insert(schema.organization).values({
		id: "G",
		name: "Trip",
		slug: "trip",
		createdAt: now,
	});
	await db.insert(schema.member).values(
		["A", "B"].map((userId) => ({
			id: `G-${userId}`,
			organizationId: "G",
			userId,
			role: "owner",
			createdAt: now,
		})),
	);
	const ctx = {
		db,
		user: { id: "A", name: "A", email: "a@test.invalid" },
		apiKeyId: null,
		apiKeyPermissions: null,
		session: { id: "s", userId: "A", activeOrganizationId: "G" },
	} as unknown as Ctx;
	return { client, db, ctx };
}

/**
 * A profile is read from one member list, so bio, the number and both toggles
 * have to arrive together. The number lives on `channel_identity` and is joined
 * in, which is the step that can silently drop a field.
 */
test("member rows carry bio, the channel phone and both visibility toggles", async () => {
	const { client, db, ctx } = await fixture();
	try {
		await db
			.update(schema.user)
			.set({ bio: "Chasing the last rupee.", isPhonePublic: false })
			.where(eq(schema.user.id, "A"));
		await db.insert(channelIdentity).values({
			id: "ci1",
			userId: "A",
			channel: "phone",
			address: NUMBER,
		});

		const members = await listMembers(ctx, { groupId: "G" });
		const a = members.find((row) => row.userId === "A");
		assert.equal(a?.bio, "Chasing the last rupee.");
		assert.equal(a?.phone, NUMBER);
		assert.equal(a?.isEmailPublic, true, "email defaults to shown");
		assert.equal(a?.isPhonePublic, false, "phone can be hidden");
		// A member with no number reads as null, not undefined, so the profile
		// treats "none saved" and "hidden" as different things.
		assert.equal(members.find((row) => row.userId === "B")?.phone, null);
	} finally {
		client.close();
	}
});

/**
 * The toggles are enforced on the server: another member's hidden email and
 * number never reach the response, while your own row keeps both.
 */
test("hidden contact details are withheld from other members", async () => {
	const { client, db, ctx } = await fixture();
	try {
		await db
			.update(schema.user)
			.set({ isEmailPublic: false, isPhonePublic: false });
		await db.insert(channelIdentity).values([
			{ id: "ci1", userId: "A", channel: "phone", address: NUMBER },
			{ id: "ci2", userId: "B", channel: "phone", address: "+919800000000" },
		]);

		const members = await listMembers(ctx, { groupId: "G" });
		const a = members.find((row) => row.userId === "A");
		const b = members.find((row) => row.userId === "B");
		assert.equal(a?.email, "a@test.invalid", "your own email stays");
		assert.equal(a?.phone, NUMBER, "your own number stays");
		assert.equal(b?.email, null);
		assert.equal(b?.phone, null);
	} finally {
		client.close();
	}
});
