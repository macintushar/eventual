import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import { channelIdentity } from "#/db/schema";
import type { Ctx } from "#/server/context";
import { profile } from "#/server/web-api";

/**
 * A number held by someone else is refused before anything is written, so the
 * rejected save keeps both the old number and the rest of the profile.
 */
test("a refused phone number leaves the profile untouched", async () => {
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	try {
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
		await db.insert(channelIdentity).values([
			{ id: "ci1", userId: "A", channel: "phone", address: "+919876543210" },
			{ id: "ci2", userId: "B", channel: "phone", address: "+919800000000" },
		]);
		const ctx = { db, user: { id: "A" } } as unknown as Ctx;

		await assert.rejects(
			profile(ctx, { name: "Renamed", phone: "+919800000000" }),
			/already linked/,
		);

		const a = await db.query.user.findFirst({ where: eq(schema.user.id, "A") });
		assert.equal(a?.name, "A");
		const phones = await db.query.channelIdentity.findMany({
			where: eq(channelIdentity.userId, "A"),
		});
		assert.deepEqual(
			phones.map((row) => row.address),
			["+919876543210"],
		);
	} finally {
		client.close();
	}
});
