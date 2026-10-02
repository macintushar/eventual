import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import {
	acceptInvitation,
	addMember,
	createExpense,
	createSettlement,
	listMembers,
	setSharePaid,
	updateGuest,
} from "#/server/services/app";

async function fixture() {
	const client = createClient({ url: ":memory:" });
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "./drizzle" });
	const now = new Date();
	// A owns the group, M is an ordinary member, X and Y have accounts elsewhere.
	const users = ["A", "M", "X", "Y"].map((id) => ({
		id,
		name: id,
		email: `${id.toLowerCase()}@example.com`,
		emailVerified: true,
		image: null,
		createdAt: now,
		updatedAt: now,
	}));
	await db.insert(schema.user).values(users);
	await db.insert(schema.account).values(
		users.map((user) => ({
			id: `account-${user.id}`,
			userId: user.id,
			accountId: user.id,
			providerId: "credential",
			createdAt: now,
			updatedAt: now,
		})),
	);
	await db.insert(schema.organization).values({
		id: "G",
		name: "Trip to TVM",
		slug: "trip",
		createdAt: now,
	});
	await db.insert(schema.member).values([
		{
			id: "m-A",
			organizationId: "G",
			userId: "A",
			role: "owner",
			createdAt: now,
		},
		{
			id: "m-M",
			organizationId: "G",
			userId: "M",
			role: "member",
			createdAt: now,
		},
	]);
	const as = (index: number) =>
		({
			db,
			user: users[index],
			apiKeyId: "test",
			session: {
				id: `s-${index}`,
				userId: users[index].id,
				token: "test",
				expiresAt: now,
				createdAt: now,
				updatedAt: now,
				activeOrganizationId: "G",
				ipAddress: null,
				userAgent: null,
			},
		}) as Ctx;
	return { client, db, owner: as(0), member: as(1), x: as(2), y: as(3) };
}

async function hotel(ctx: Ctx, guestId: string) {
	return createExpense(ctx, {
		groupId: "G",
		description: "Hotel room",
		amountMinor: 3000,
		currency: "INR",
		paidByUserId: "A",
		splitMethod: "even",
		date: new Date(),
		participants: [
			{ userId: "A", input: null },
			{ userId: guestId, input: null },
		],
	});
}

test("a guest added with an email never holds it and merges on accept", async () => {
	const f = await fixture();
	try {
		const added = await addMember(f.owner, {
			groupId: "G",
			name: "Charita",
			email: "x@example.com",
		});
		// X already has an account, so they are invited rather than added.
		assert.equal(added.member, null);

		const guest = await addMember(f.owner, {
			groupId: "G",
			name: "Gomathi",
			email: "Gomathi@Example.com",
		});
		const guestUser = await f.db.query.user.findFirst({
			where: eq(schema.user.id, guest.userId),
		});
		assert.match(guestUser?.email ?? "", /@guests\.eventual\.invalid$/);
		const again = await addMember(f.owner, {
			groupId: "G",
			name: "Gomathi",
			email: "gomathi@example.com",
		});
		assert.equal(again.userId, guest.userId, "same address, same guest");
		const members = await listMembers(f.owner, { groupId: "G" });
		assert.equal(
			members.find((row) => row.userId === guest.userId)?.invitedEmail,
			"gomathi@example.com",
		);

		const expense = await hotel(f.owner, guest.userId);
		assert.ok(guest.invitation);

		// Gomathi signs up and accepts: the guest's share becomes hers.
		const now = new Date();
		await f.db.insert(schema.user).values({
			id: "Z",
			name: "Gomathi R",
			email: "gomathi@example.com",
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		});
		await f.db.insert(schema.account).values({
			id: "account-Z",
			userId: "Z",
			accountId: "Z",
			providerId: "credential",
			createdAt: now,
			updatedAt: now,
		});
		const z = {
			...f.owner,
			user: { ...f.owner.user, id: "Z", email: "gomathi@example.com" },
		} as Ctx;
		await acceptInvitation(z, { invitationId: guest.invitation.invitationId });
		const shares = await f.db.query.expenseShare.findMany({
			where: eq(schema.expenseShare.expenseId, expense.id),
		});
		assert.deepEqual(shares.map((row) => row.userId).sort(), ["A", "Z"]);
		assert.equal(
			await f.db.query.user.findFirst({
				where: eq(schema.user.id, guest.userId),
			}),
			undefined,
		);
		const joined = await listMembers(f.owner, { groupId: "G" });
		assert.deepEqual(joined.map((row) => row.userId).sort(), ["A", "M", "Z"]);
	} finally {
		f.client.close();
	}
});

test("admins correct a guest's contact details and re-point the invitation", async () => {
	const f = await fixture();
	try {
		const guest = await addMember(f.owner, {
			groupId: "G",
			name: "Ashok",
			email: "balakrishnan.ashok@example.com",
		});
		await hotel(f.owner, guest.userId);

		await assert.rejects(
			updateGuest(f.member, { groupId: "G", userId: guest.userId, name: "A" }),
			/role does not allow/,
		);
		await assert.rejects(
			updateGuest(f.owner, { groupId: "G", userId: "M", name: "Someone" }),
			/Only guests can be edited/,
		);
		await assert.rejects(
			updateGuest(f.owner, {
				groupId: "G",
				userId: guest.userId,
				email: "m@example.com",
			}),
			/already in this group/,
		);

		// The owner typed the wrong address; Ashok's account is y@example.com.
		const updated = await updateGuest(f.owner, {
			groupId: "G",
			userId: guest.userId,
			email: "y@example.com",
			phone: "+91 98765 43210",
		});
		assert.ok(updated.invitation);
		const invites = await f.db.query.invitation.findMany({
			where: eq(schema.invitation.guestUserId, guest.userId),
		});
		assert.deepEqual(invites.map((row) => [row.email, row.status]).sort(), [
			["balakrishnan.ashok@example.com", "canceled"],
			["y@example.com", "pending"],
		]);
		const members = await listMembers(f.owner, { groupId: "G" });
		assert.deepEqual(
			members
				.filter((row) => row.userId === guest.userId)
				.map((row) => [row.phone, row.invitedEmail]),
			[["+919876543210", "y@example.com"]],
		);

		await acceptInvitation(f.y, {
			invitationId: updated.invitation.invitationId,
		});
		const shares = await f.db.query.expenseShare.findMany({
			where: eq(schema.expenseShare.userId, "Y"),
		});
		assert.equal(shares.length, 1);
		const phone = await f.db.query.channelIdentity.findFirst({
			where: and(
				eq(schema.channelIdentity.channel, "phone"),
				eq(schema.channelIdentity.address, "+919876543210"),
			),
		});
		assert.equal(phone?.userId, "Y");
	} finally {
		f.client.close();
	}
});

test("any member can record a repayment between other members", async () => {
	const f = await fixture();
	try {
		const guest = await addMember(f.owner, { groupId: "G", name: "Gomathi" });
		const expense = await hotel(f.owner, guest.userId);

		// M is neither side of the payment and not an admin.
		const settlement = await createSettlement(f.member, {
			groupId: "G",
			fromUserId: guest.userId,
			toUserId: "A",
			amountMinor: 1500,
			currency: "INR",
		});
		assert.equal(settlement?.fromUserId, guest.userId);
		assert.equal(settlement?.createdByUserId, "M");
		const share = await f.db.query.expenseShare.findFirst({
			where: and(
				eq(schema.expenseShare.expenseId, expense.id),
				eq(schema.expenseShare.userId, guest.userId),
			),
		});
		assert.ok(share?.paidAt);
		assert.equal(share?.paidMarkedByUserId, "M");

		// Any member can mark shares, but a settlement's shares stay locked to it.
		await assert.rejects(
			setSharePaid(
				f.member,
				{ expenseId: expense.id, userId: guest.userId },
				false,
			),
			/linked settlement/,
		);
		// Outsiders still can't touch the group.
		const outsider = {
			...f.member,
			user: { ...f.member.user, id: "X" },
		} as Ctx;
		await assert.rejects(
			createSettlement(outsider, {
				groupId: "G",
				fromUserId: guest.userId,
				toUserId: "A",
				amountMinor: 100,
				currency: "INR",
			}),
			/not a member/,
		);
	} finally {
		f.client.close();
	}
});

test("an unmatched email cannot claim a guest through their phone", async () => {
	const f = await fixture();
	try {
		const guest = await addMember(f.owner, {
			groupId: "G",
			name: "Guest",
			phone: "+919876543210",
			email: "original@example.com",
		});
		await assert.rejects(
			addMember(f.owner, {
				groupId: "G",
				name: "Other",
				phone: "+919876543210",
				email: "other@example.com",
			}),
			/Email and phone identify different people/,
		);
		const again = await addMember(f.owner, {
			groupId: "G",
			name: "Guest",
			phone: "+919876543210",
			email: "original@example.com",
		});
		assert.equal(again.userId, guest.userId);
		assert.equal((await f.db.query.invitation.findMany()).length, 1);
	} finally {
		f.client.close();
	}
});

test("correcting an invitation preserves its admin or owner role", async () => {
	for (const role of ["admin", "owner"] as const) {
		const f = await fixture();
		try {
			const guest = await addMember(f.owner, {
				groupId: "G",
				name: "Guest",
				email: "typo@example.com",
				role,
			});
			await updateGuest(f.owner, {
				groupId: "G",
				userId: guest.userId,
				email: "x@example.com",
			});
			const pending = await f.db.query.invitation.findFirst({
				where: eq(schema.invitation.status, "pending"),
			});
			assert.equal(pending?.role, role);
			assert.ok(pending);
			await acceptInvitation(f.x, { invitationId: pending.id });
			const joined = await f.db.query.member.findFirst({
				where: eq(schema.member.userId, "X"),
			});
			assert.equal(joined?.role, role);
		} finally {
			f.client.close();
		}
	}
});

test("accepting a shared guest invitation refuses without leaving a duplicate member", async () => {
	const f = await fixture();
	try {
		const guest = await addMember(f.owner, {
			groupId: "G",
			name: "Guest",
			email: "new@example.com",
		});
		await hotel(f.owner, guest.userId);
		const now = new Date();
		await f.db
			.insert(schema.organization)
			.values({ id: "H", name: "Other", slug: "other", createdAt: now });
		await f.db.insert(schema.member).values({
			id: "m-H",
			organizationId: "H",
			userId: guest.userId,
			role: "member",
			createdAt: now,
		});
		// Account creation occurs after the guest invitation was issued.
		await f.db
			.update(schema.user)
			.set({ email: "new@example.com" })
			.where(eq(schema.user.id, "X"));
		const target = {
			...f.x,
			user: { ...f.x.user, email: "new@example.com" },
		} as Ctx;
		assert.ok(guest.invitation);
		await assert.rejects(
			acceptInvitation(target, { invitationId: guest.invitation.invitationId }),
			/could not be transferred/,
		);
		assert.equal((await f.db.query.invitation.findFirst())?.status, "pending");
		assert.equal(
			await f.db.query.member.findFirst({
				where: eq(schema.member.userId, "X"),
			}),
			undefined,
		);
		assert.ok(
			await f.db.query.expenseShare.findFirst({
				where: eq(schema.expenseShare.userId, guest.userId),
			}),
		);
	} finally {
		f.client.close();
	}
});

test("a guest who claimed their account can still accept their invitation", async () => {
	const f = await fixture();
	try {
		const guest = await addMember(f.owner, {
			groupId: "G",
			name: "Legacy",
			email: "legacy@example.com",
		});
		await hotel(f.owner, guest.userId);
		assert.ok(guest.invitation);
		// The legacy claim flow keeps the guest's user ID but ends guest status.
		await f.db
			.update(schema.user)
			.set({
				isGuest: false,
				claimedAt: new Date(),
				email: "legacy@example.com",
				emailVerified: true,
			})
			.where(eq(schema.user.id, guest.userId));
		// A role change made after the invitation was sent must survive accepting it.
		await f.db
			.update(schema.member)
			.set({ role: "admin" })
			.where(eq(schema.member.userId, guest.userId));
		const claimed = {
			...f.owner,
			user: {
				...f.owner.user,
				id: guest.userId,
				email: "legacy@example.com",
			},
		} as Ctx;
		await acceptInvitation(claimed, {
			invitationId: guest.invitation.invitationId,
		});
		assert.equal((await f.db.query.invitation.findFirst())?.status, "accepted");
		const rows = await f.db.query.member.findMany({
			where: and(
				eq(schema.member.organizationId, "G"),
				eq(schema.member.userId, guest.userId),
			),
		});
		assert.equal(rows.length, 1);
		assert.equal(rows[0].role, "admin");
		assert.ok(
			await f.db.query.expenseShare.findFirst({
				where: eq(schema.expenseShare.userId, guest.userId),
			}),
		);
	} finally {
		f.client.close();
	}
});

test("an admin cannot redirect an owner invitation", async () => {
	const f = await fixture();
	try {
		const guest = await addMember(f.owner, {
			groupId: "G",
			name: "Guest",
			email: "typo@example.com",
			role: "owner",
		});
		await f.db
			.update(schema.member)
			.set({ role: "admin" })
			.where(eq(schema.member.userId, "M"));
		await assert.rejects(
			updateGuest(f.member, {
				groupId: "G",
				userId: guest.userId,
				email: "x@example.com",
			}),
			/Only owners can reissue/,
		);
		const pending = await f.db.query.invitation.findFirst();
		assert.equal(pending?.email, "typo@example.com");
		assert.equal(pending?.status, "pending");
	} finally {
		f.client.close();
	}
});
