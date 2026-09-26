import { and, eq, inArray } from "drizzle-orm";
import { activity, activityRecipient, member } from "#/db/schema";
import type { Ctx } from "#/server/context";
import type { Recipient } from "#/server/domain/activity";
import { AppError } from "#/server/errors";

export type Role = "owner" | "admin" | "member";
export const id = () => crypto.randomUUID();

export async function membership(ctx: Ctx, organizationId: string) {
	const row = await ctx.db.query.member.findFirst({
		where: and(
			eq(member.organizationId, organizationId),
			eq(member.userId, ctx.user.id),
		),
	});
	if (!row)
		throw new AppError("FORBIDDEN", "You are not a member of this group");
	return row as typeof row & { role: Role };
}

export function requireRole(role: Role, allowed: Role[]) {
	if (!allowed.includes(role))
		throw new AppError(
			"FORBIDDEN",
			"Your group role does not allow this action",
		);
}

export const activityRow = (
	organizationId: string,
	actorUserId: string,
	type: typeof activity.$inferInsert.type,
	targetType: string,
	targetId: string,
	metadata: object = {},
) => ({
	id: id(),
	organizationId,
	actorUserId,
	type,
	targetType,
	targetId,
	metadata: JSON.stringify(metadata),
	createdAt: new Date(),
});

/**
 * Writes an activity and fans it out to the personal feed of everyone it
 * involves, in the same transaction so neither can exist without the other.
 */
export async function recordActivity(
	tx: Pick<Ctx["db"], "insert">,
	row: ReturnType<typeof activityRow>,
	recipients: Recipient[] = [],
) {
	await tx.insert(activity).values(row);
	if (recipients.length)
		await tx
			.insert(activityRecipient)
			.values(
				recipients.map((recipient) => ({
					activityId: row.id,
					userId: recipient.userId,
					deltaMinor: recipient.deltaMinor,
					createdAt: row.createdAt,
				})),
			)
			.onConflictDoNothing();
}

export async function assertExpenseMembers(
	ctx: Ctx,
	groupId: string,
	payerId: string,
	participantIds: string[],
) {
	const ids = [...new Set([payerId, ...participantIds])];
	const rows = await ctx.db
		.select({ userId: member.userId })
		.from(member)
		.where(
			and(eq(member.organizationId, groupId), inArray(member.userId, ids)),
		);
	if (rows.length !== ids.length)
		throw new AppError(
			"VALIDATION",
			"The payer and every participant must be current group members",
		);
}
