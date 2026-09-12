import { db } from "#/db";
import * as schema from "#/db/schema";
import { auth } from "#/lib/auth";
import { computeShares } from "#/server/domain/split";

await db.delete(schema.organization);
await db.delete(schema.user);

const credentials = [
	{
		name: "Tushar Sharma",
		email: "tushar@eventual.test",
		password: "eventual123",
	},
	{
		name: "Mac",
		email: "mac@eventual.test",
		password: "eventual123",
	},
	{
		name: "Arjun Mehta",
		email: "arjun@eventual.test",
		password: "eventual123",
	},
];

const users: Array<{ id: string; name: string; email: string }> = [];
for (const credential of credentials) {
	const result = await auth.api.signUpEmail({ body: credential });
	users.push(result.user);
}

const now = new Date();
const groups = [
	{
		id: crypto.randomUUID(),
		name: "Goa Weekend",
		slug: "goa-weekend",
		createdAt: now,
	},
	{ id: crypto.randomUUID(), name: "Flat 4B", slug: "flat-4b", createdAt: now },
];
await db.insert(schema.organization).values(groups);
await db.insert(schema.member).values(
	groups.flatMap((group) =>
		users.map((user, index) => ({
			id: crypto.randomUUID(),
			organizationId: group.id,
			userId: user.id,
			role: index === 0 ? "owner" : index === 1 ? "admin" : "member",
			createdAt: now,
		})),
	),
);

const methods = ["even", "exact", "shares", "percent"] as const;
const descriptions = [
	"Beach shack dinner",
	"Scooter rental",
	"Villa groceries",
	"Airport taxi",
	"Electricity bill",
	"Sunday brunch",
	"Cleaning supplies",
	"Movie night",
	"Train snacks",
	"Coffee run",
	"Water delivery",
	"House party",
];
const shareIds: string[][] = [];

for (let index = 0; index < descriptions.length; index++) {
	const amountMinor = 12000 + index * 1375;
	const method = methods[index % methods.length];
	const inputs =
		method === "exact"
			? [4000, 4000, amountMinor - 8000]
			: method === "shares"
				? [1, 2, 3]
				: method === "percent"
					? [5000, 3000, 2000]
					: [null, null, null];
	const shares = computeShares(
		amountMinor,
		method,
		users.map((user, userIndex) => ({
			userId: user.id,
			input: inputs[userIndex],
		})),
	);
	const expenseId = crypto.randomUUID();
	const ids = shares.map(() => crypto.randomUUID());
	shareIds.push(ids);
	const date = new Date(
		now.getTime() - (descriptions.length - index) * 86400000,
	);
	await db.insert(schema.expense).values({
		id: expenseId,
		organizationId: groups[index < 8 ? 0 : 1].id,
		description: descriptions[index],
		amountMinor,
		currency: "INR",
		paidByUserId: users[index % users.length].id,
		splitMethod: method,
		date,
		createdByUserId: users[0].id,
		createdAt: date,
		updatedAt: date,
	});
	await db.insert(schema.expenseShare).values(
		shares.map((share, shareIndex) => ({
			id: ids[shareIndex],
			expenseId,
			userId: share.userId,
			amountMinor: share.amountMinor,
			splitInput: share.splitInput,
			paidAt: index === 2 && shareIndex === 1 ? now : null,
			paidMarkedByUserId: index === 2 && shareIndex === 1 ? users[1].id : null,
		})),
	);
	await db.insert(schema.activity).values({
		id: crypto.randomUUID(),
		organizationId: groups[index < 8 ? 0 : 1].id,
		// The payer is the one who logged it, so the feed matches the expense row.
		actorUserId: users[index % users.length].id,
		type: "expense.created",
		targetType: "expense",
		targetId: expenseId,
		metadata: JSON.stringify({
			description: descriptions[index],
			amountMinor,
		}),
		createdAt: date,
	});
}

const firstShares = computeShares(
	12000,
	"even",
	users.map((user) => ({ userId: user.id, input: null })),
);
const payerId = users[0].id;
const debtorIndex = firstShares.findIndex((share) => share.userId !== payerId);
const settlementId = crypto.randomUUID();
await db.insert(schema.settlement).values({
	id: settlementId,
	organizationId: groups[0].id,
	fromUserId: firstShares[debtorIndex].userId,
	toUserId: payerId,
	amountMinor: firstShares[debtorIndex].amountMinor,
	currency: "INR",
	note: "Seeded settlement",
	createdByUserId: firstShares[debtorIndex].userId,
	createdAt: now,
});
await db
	.update(schema.expenseShare)
	.set({ paidAt: now, paidMarkedByUserId: firstShares[debtorIndex].userId })
	.where(
		(await import("drizzle-orm")).eq(
			schema.expenseShare.id,
			shareIds[0][debtorIndex],
		),
	);
await db.insert(schema.settlementAllocation).values({
	id: crypto.randomUUID(),
	settlementId,
	expenseShareId: shareIds[0][debtorIndex],
	amountMinor: firstShares[debtorIndex].amountMinor,
});
await db.insert(schema.activity).values({
	id: crypto.randomUUID(),
	organizationId: groups[0].id,
	actorUserId: firstShares[debtorIndex].userId,
	type: "settlement.created",
	targetType: "settlement",
	targetId: settlementId,
	// Same metadata shape the service writes, so the activity feed can render a
	// full sentence ("… recorded a payment to Tushar of ₹40.00").
	metadata: JSON.stringify({
		fromUserId: firstShares[debtorIndex].userId,
		toUserId: payerId,
		amountMinor: firstShares[debtorIndex].amountMinor,
	}),
	createdAt: now,
});

console.log("Seed complete. Login credentials:");
for (const credential of credentials)
	console.log(`${credential.email} / ${credential.password}`);
