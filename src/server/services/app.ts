import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lt,
	lte,
	ne,
	or,
	type SQL,
} from "drizzle-orm";

import {
	activity,
	activityRecipient,
	expense,
	expenseShare,
	invitation,
	member,
	organization,
	session,
	settlement,
	settlementAllocation,
	user,
} from "#/db/schema";
import { emailKey } from "#/lib/auth-email";
import { validateRepayment, validateSharePayment } from "#/lib/settlements";
import { runInBackground } from "#/server/background";
import type { Ctx } from "#/server/context";
import {
	expenseRecipients,
	people,
	type Recipient,
	updatedExpenseRecipients,
} from "#/server/domain/activity";
import { computeBalances, simplifyBalances } from "#/server/domain/balances";
import { computeShares } from "#/server/domain/split";
import { AppError } from "#/server/errors";
import type {
	CreateExpenseInput,
	CreateGroupInput,
	CreateSettlementInput,
	UpdateExpenseInput,
} from "#/server/schemas";

type Role = "owner" | "admin" | "member";
const id = () => crypto.randomUUID();

async function membership(ctx: Ctx, organizationId: string) {
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

function requireRole(role: Role, allowed: Role[]) {
	if (!allowed.includes(role))
		throw new AppError(
			"FORBIDDEN",
			"Your group role does not allow this action",
		);
}

const activityRow = (
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
async function recordActivity(
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

export async function listGroups(ctx: Ctx) {
	const rows = await ctx.db
		.select({ organization, role: member.role })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, ctx.user.id))
		.orderBy(asc(organization.name));
	if (!rows.length) return [];
	const groupIds = rows.map(({ organization: group }) => group.id);
	// The join above already proves membership in every group, so these three
	// batched reads stand in for a per-group `getBalances`, which cost four
	// queries each and then had its simplified transfer list thrown away.
	const [memberRows, expenses, settlements] = await Promise.all([
		ctx.db
			.select({
				organizationId: member.organizationId,
				userId: user.id,
				name: user.name,
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(inArray(member.organizationId, groupIds))
			.orderBy(asc(user.name)),
		ctx.db.query.expense.findMany({
			where: inArray(expense.organizationId, groupIds),
			with: { shares: true },
		}),
		ctx.db.query.settlement.findMany({
			where: inArray(settlement.organizationId, groupIds),
			with: { allocations: true },
		}),
	]);
	const byGroup = <Row extends { organizationId: string }>(list: Row[]) => {
		const map = new Map(groupIds.map((groupId) => [groupId, [] as Row[]]));
		for (const row of list) map.get(row.organizationId)?.push(row);
		return map;
	};
	const membersByGroup = byGroup(memberRows);
	const expensesByGroup = byGroup(expenses);
	const settlementsByGroup = byGroup(settlements);
	return rows.map(({ organization: group, role }) => ({
		...group,
		role,
		balances: computeBalances(
			membersByGroup.get(group.id) ?? [],
			expensesByGroup.get(group.id) ?? [],
			settlementsByGroup.get(group.id) ?? [],
		)
			.filter((row) => row.userId === ctx.user.id)
			.map(({ currency, balanceMinor }) => ({ currency, balanceMinor })),
	}));
}

/**
 * Every group the caller belongs to, with its member list. The expense
 * composer opens from anywhere — the dock, the dashboard, a group page — so it
 * needs the whole picture up front to offer a group step. `listGroups` carries
 * balances the composer never reads and no members it always needs, so this is
 * a separate, cheaper pair of reads rather than a flag on that one.
 */
export async function listGroupsWithMembers(ctx: Ctx) {
	const rows = await ctx.db
		.select({ id: organization.id, name: organization.name })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, ctx.user.id))
		.orderBy(asc(organization.name));
	if (!rows.length) return [];
	const groupIds = rows.map((row) => row.id);
	const memberRows = await ctx.db
		.select({
			organizationId: member.organizationId,
			userId: user.id,
			name: user.name,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(inArray(member.organizationId, groupIds))
		.orderBy(asc(user.name));
	const byGroup = new Map(
		groupIds.map((groupId) => [
			groupId,
			[] as { userId: string; name: string }[],
		]),
	);
	for (const row of memberRows)
		byGroup
			.get(row.organizationId)
			?.push({ userId: row.userId, name: row.name });
	return rows.map((row) => ({ ...row, members: byGroup.get(row.id) ?? [] }));
}

export async function createGroup(ctx: Ctx, input: CreateGroupInput) {
	const groupId = id();
	const now = new Date();
	const slug =
		input.slug ??
		`${
			input.name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "") || "group"
		}-${groupId.slice(0, 6)}`;
	await ctx.db.transaction(async (tx) => {
		await tx
			.insert(organization)
			.values({ id: groupId, name: input.name, slug, createdAt: now });
		await tx.insert(member).values({
			id: id(),
			organizationId: groupId,
			userId: ctx.user.id,
			role: "owner",
			createdAt: now,
		});
		await recordActivity(
			tx,
			activityRow(groupId, ctx.user.id, "group.created", "group", groupId, {
				name: input.name,
			}),
		);
	});
	return getGroup(ctx, { groupId });
}

export async function getGroup(ctx: Ctx, input: { groupId: string }) {
	const mine = await membership(ctx, input.groupId);
	if (!ctx.apiKeyId && ctx.session.activeOrganizationId !== input.groupId)
		await ctx.db
			.update(session)
			.set({ activeOrganizationId: input.groupId })
			.where(eq(session.id, ctx.session.id));
	const group = await ctx.db.query.organization.findFirst({
		where: eq(organization.id, input.groupId),
	});
	if (!group) throw new AppError("NOT_FOUND", "Group not found");
	const members = await listMembers(ctx, input);
	return { ...group, members, myRole: mine.role };
}

export async function renameGroup(
	ctx: Ctx,
	input: { groupId: string; name: string },
) {
	const mine = await membership(ctx, input.groupId);
	requireRole(mine.role, ["owner", "admin"]);
	await ctx.db.transaction(async (tx) => {
		const previous = await tx.query.organization.findFirst({
			where: eq(organization.id, input.groupId),
		});
		if (!previous) throw new AppError("NOT_FOUND", "Group not found");
		await tx
			.update(organization)
			.set({ name: input.name })
			.where(eq(organization.id, input.groupId));
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"group.renamed",
				"group",
				input.groupId,
				{ from: previous.name, to: input.name },
			),
		);
	});
	return getGroup(ctx, input);
}

export async function deleteGroup(ctx: Ctx, input: { groupId: string }) {
	const mine = await membership(ctx, input.groupId);
	requireRole(mine.role, ["owner"]);
	await ctx.db.delete(organization).where(eq(organization.id, input.groupId));
	return { success: true };
}

export async function listMembers(ctx: Ctx, input: { groupId: string }) {
	await membership(ctx, input.groupId);
	return ctx.db
		.select({
			id: member.id,
			userId: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			role: member.role,
			createdAt: member.createdAt,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(eq(member.organizationId, input.groupId))
		.orderBy(asc(user.name));
}

async function assertCanExit(ctx: Ctx, groupId: string, userId: string) {
	const balances = await getBalances(ctx, { groupId });
	const hasBalance = balances.members.some(
		(row) => row.userId === userId && row.balanceMinor !== 0,
	);
	const unpaid = await ctx.db
		.select({ id: expenseShare.id })
		.from(expenseShare)
		.innerJoin(expense, eq(expenseShare.expenseId, expense.id))
		.where(
			and(
				eq(expense.organizationId, groupId),
				eq(expenseShare.userId, userId),
				isNull(expenseShare.paidAt),
				ne(expense.paidByUserId, userId),
			),
		)
		.limit(1);
	if (hasBalance || unpaid.length)
		throw new AppError(
			"CONFLICT",
			"Settle this member's balance and unpaid shares before they leave",
		);
}

async function ownerCount(ctx: Ctx, groupId: string) {
	const owners = await ctx.db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.organizationId, groupId), eq(member.role, "owner")));
	return owners.length;
}

export async function updateMemberRole(
	ctx: Ctx,
	input: { groupId: string; userId: string; role: Role },
) {
	const mine = await membership(ctx, input.groupId);
	requireRole(mine.role, ["owner"]);
	const target = await ctx.db.query.member.findFirst({
		where: and(
			eq(member.organizationId, input.groupId),
			eq(member.userId, input.userId),
		),
	});
	if (!target) throw new AppError("NOT_FOUND", "Member not found");
	if (
		target.role === "owner" &&
		input.role !== "owner" &&
		(await ownerCount(ctx, input.groupId)) === 1
	)
		throw new AppError("CONFLICT", "The last owner cannot be demoted");
	await ctx.db.transaction(async (tx) => {
		await tx
			.update(member)
			.set({ role: input.role })
			.where(eq(member.id, target.id));
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"member.role_changed",
				"member",
				target.id,
				{ userId: input.userId, from: target.role, to: input.role },
			),
			people(input.userId),
		);
	});
	return { success: true };
}

export async function removeMember(
	ctx: Ctx,
	input: { groupId: string; userId: string },
) {
	const mine = await membership(ctx, input.groupId);
	requireRole(mine.role, ["owner", "admin"]);
	const target = await ctx.db.query.member.findFirst({
		where: and(
			eq(member.organizationId, input.groupId),
			eq(member.userId, input.userId),
		),
	});
	if (!target) throw new AppError("NOT_FOUND", "Member not found");
	if (mine.role === "admin" && target.role !== "member")
		throw new AppError("FORBIDDEN", "Admins can only remove members");
	if (target.role === "owner" && (await ownerCount(ctx, input.groupId)) === 1)
		throw new AppError("CONFLICT", "The last owner cannot be removed");
	await assertCanExit(ctx, input.groupId, input.userId);
	await ctx.db.transaction(async (tx) => {
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"member.removed",
				"member",
				target.id,
				{ userId: input.userId },
			),
			people(input.userId),
		);
		await tx.delete(member).where(eq(member.id, target.id));
	});
	return { success: true };
}

export async function leaveGroup(ctx: Ctx, input: { groupId: string }) {
	const mine = await membership(ctx, input.groupId);
	if (mine.role === "owner" && (await ownerCount(ctx, input.groupId)) === 1)
		throw new AppError("CONFLICT", "The last owner cannot leave");
	await assertCanExit(ctx, input.groupId, ctx.user.id);
	await ctx.db.transaction(async (tx) => {
		await recordActivity(
			tx,
			activityRow(input.groupId, ctx.user.id, "member.left", "member", mine.id),
			people(ctx.user.id),
		);
		await tx.delete(member).where(eq(member.id, mine.id));
	});
	return { success: true };
}

export async function listInvitations(ctx: Ctx, input: { groupId: string }) {
	const mine = await membership(ctx, input.groupId);
	requireRole(mine.role, ["owner", "admin"]);
	return ctx.db.query.invitation.findMany({
		where: and(
			eq(invitation.organizationId, input.groupId),
			eq(invitation.status, "pending"),
		),
		orderBy: desc(invitation.createdAt),
	});
}

export async function createInvitation(
	ctx: Ctx,
	input: { groupId: string; email: string; role: Role },
) {
	const mine = await membership(ctx, input.groupId);
	requireRole(mine.role, ["owner", "admin"]);
	if (input.role === "owner" && mine.role !== "owner")
		throw new AppError("FORBIDDEN", "Only owners can invite another owner");
	const group = await ctx.db.query.organization.findFirst({
		where: eq(organization.id, input.groupId),
	});
	if (!group) throw new AppError("NOT_FOUND", "Group not found");
	const normalizedEmail = input.email.toLowerCase();
	const created = await ctx.db.transaction(async (tx) => {
		const existing = await tx.query.invitation.findFirst({
			where: and(
				eq(invitation.organizationId, input.groupId),
				eq(invitation.email, normalizedEmail),
				eq(invitation.status, "pending"),
				gte(invitation.expiresAt, new Date()),
			),
			orderBy: desc(invitation.createdAt),
		});
		if (existing) {
			if (existing.role !== input.role)
				throw new AppError(
					"CONFLICT",
					`That email already has a pending ${existing.role ?? "member"} invitation`,
				);
			return existing;
		}

		const createdAt = new Date();
		const createdInvitation = {
			id: id(),
			organizationId: input.groupId,
			email: normalizedEmail,
			role: input.role,
			status: "pending",
			inviterId: ctx.user.id,
			createdAt,
			expiresAt: new Date(createdAt.getTime() + 7 * 86400000),
		};
		await tx.insert(invitation).values(createdInvitation);
		// Only someone who already has an account can have a feed to land in.
		const invitee = await tx.query.user.findFirst({
			where: eq(user.email, normalizedEmail),
			columns: { id: true },
		});
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"member.invited",
				"invitation",
				createdInvitation.id,
				{ email: input.email, role: input.role },
			),
			people(invitee?.id),
		);
		return createdInvitation;
	});
	let emailDelivery: "scheduled" | "unconfigured" = "unconfigured";
	if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
		const [{ env }, { sendEmail }] = await Promise.all([
			import("#/env"),
			import("#/server/email"),
		]);
		runInBackground(
			sendEmail(
				normalizedEmail,
				{
					kind: "invitation",
					url: new URL(`/invite/${created.id}`, env.BETTER_AUTH_URL).toString(),
					groupName: group.name,
					inviterName: ctx.user.name,
					inviteeRole: created.role ?? "member",
					expiresAt: created.expiresAt,
				},
				emailKey("invitation", created.id),
			),
			{ component: "email", kind: "invitation" },
		);
		emailDelivery = "scheduled";
	}
	return {
		invitationId: created.id,
		inviteUrl: `/invite/${created.id}`,
		emailDelivery,
	};
}

export async function getInvitation(
	ctx: Ctx | null,
	input: { invitationId: string },
) {
	const row = await (ctx?.db ?? (await import("#/db")).db)
		.select({
			invitation,
			groupName: organization.name,
			inviterName: user.name,
		})
		.from(invitation)
		.innerJoin(organization, eq(invitation.organizationId, organization.id))
		.innerJoin(user, eq(invitation.inviterId, user.id))
		.where(eq(invitation.id, input.invitationId))
		.limit(1);
	if (
		!row[0] ||
		row[0].invitation.status !== "pending" ||
		row[0].invitation.expiresAt < new Date()
	)
		throw new AppError("NOT_FOUND", "Invitation is invalid or expired");
	return row[0];
}

export async function revokeInvitation(
	ctx: Ctx,
	input: { invitationId: string },
) {
	const invite = await ctx.db.query.invitation.findFirst({
		where: eq(invitation.id, input.invitationId),
	});
	if (!invite) throw new AppError("NOT_FOUND", "Invitation not found");
	const mine = await membership(ctx, invite.organizationId);
	requireRole(mine.role, ["owner", "admin"]);
	await ctx.db.transaction(async (tx) => {
		await tx
			.update(invitation)
			.set({ status: "canceled" })
			.where(eq(invitation.id, invite.id));
		await recordActivity(
			tx,
			activityRow(
				invite.organizationId,
				ctx.user.id,
				"member.invite_revoked",
				"invitation",
				invite.id,
				{ email: invite.email },
			),
		);
	});
	return { success: true };
}

export async function acceptInvitation(
	ctx: Ctx,
	input: { invitationId: string },
) {
	const preview = await getInvitation(ctx, input);
	if (preview.invitation.email.toLowerCase() !== ctx.user.email.toLowerCase())
		throw new AppError("FORBIDDEN", "Sign in with the invited email address");
	const existing = await ctx.db.query.member.findFirst({
		where: and(
			eq(member.organizationId, preview.invitation.organizationId),
			eq(member.userId, ctx.user.id),
		),
	});
	await ctx.db.transaction(async (tx) => {
		if (!existing)
			await tx.insert(member).values({
				id: id(),
				organizationId: preview.invitation.organizationId,
				userId: ctx.user.id,
				role: preview.invitation.role ?? "member",
				createdAt: new Date(),
			});
		await tx
			.update(invitation)
			.set({ status: "accepted" })
			.where(eq(invitation.id, input.invitationId));
		await recordActivity(
			tx,
			activityRow(
				preview.invitation.organizationId,
				ctx.user.id,
				"member.joined",
				"member",
				ctx.user.id,
			),
			people(ctx.user.id),
		);
	});
	return { groupId: preview.invitation.organizationId };
}

export async function listMyInvitations(ctx: Ctx) {
	return ctx.db
		.select({
			invitation,
			groupName: organization.name,
			inviterName: user.name,
		})
		.from(invitation)
		.innerJoin(organization, eq(invitation.organizationId, organization.id))
		.innerJoin(user, eq(invitation.inviterId, user.id))
		.where(
			and(
				eq(invitation.email, ctx.user.email.toLowerCase()),
				eq(invitation.status, "pending"),
			),
		)
		.orderBy(desc(invitation.createdAt));
}

async function assertExpenseMembers(
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

export async function getExpense(ctx: Ctx, input: { expenseId: string }) {
	const row = await ctx.db.query.expense.findFirst({
		where: eq(expense.id, input.expenseId),
		with: {
			payer: true,
			creator: true,
			shares: { with: { user: true, allocations: true } },
		},
	});
	if (!row) throw new AppError("NOT_FOUND", "Expense not found");
	await membership(ctx, row.organizationId);
	const lockedBy = row.shares
		.filter((share) => share.paidAt)
		.map((share) => ({
			userId: share.userId,
			name: share.user.name,
			paidAt: share.paidAt,
		}));
	return { ...row, locked: lockedBy.length > 0, lockedBy };
}

export async function listExpenses(
	ctx: Ctx,
	input: {
		groupId: string;
		cursor?: string;
		limit?: number;
		paidBy?: string;
		participant?: string;
		from?: Date;
		to?: Date;
	},
) {
	await membership(ctx, input.groupId);
	const clauses = [eq(expense.organizationId, input.groupId)];
	if (input.cursor) clauses.push(lt(expense.id, input.cursor));
	if (input.paidBy) clauses.push(eq(expense.paidByUserId, input.paidBy));
	if (input.from) clauses.push(gte(expense.date, input.from));
	if (input.to) clauses.push(lte(expense.date, input.to));
	const rows = await ctx.db.query.expense.findMany({
		where: and(...clauses),
		with: { payer: true, shares: { with: { user: true } } },
		orderBy: [desc(expense.date), desc(expense.createdAt)],
		limit: input.limit ?? 30,
	});
	const filtered = input.participant
		? rows.filter((row) =>
				row.shares.some((share) => share.userId === input.participant),
			)
		: rows;
	return {
		items: filtered.map((row) => ({
			...row,
			locked: row.shares.some((share) => share.paidAt !== null),
		})),
		nextCursor: rows.length === (input.limit ?? 30) ? rows.at(-1)?.id : null,
	};
}

export function previewExpense(input: {
	amountMinor: number;
	currency?: string;
	splitMethod: CreateExpenseInput["splitMethod"];
	participants: CreateExpenseInput["participants"];
}) {
	return computeShares(
		input.amountMinor,
		input.splitMethod,
		input.participants,
		input.currency,
	);
}

export async function createExpense(ctx: Ctx, input: CreateExpenseInput) {
	await membership(ctx, input.groupId);
	await assertExpenseMembers(
		ctx,
		input.groupId,
		input.paidByUserId,
		input.participants.map((row) => row.userId),
	);
	let shares: ReturnType<typeof computeShares>;
	try {
		shares = computeShares(
			input.amountMinor,
			input.splitMethod,
			input.participants,
			input.currency,
		);
	} catch (error) {
		throw new AppError(
			"VALIDATION",
			error instanceof Error ? error.message : "Invalid split",
		);
	}
	const expenseId = id();
	const now = new Date();
	await ctx.db.transaction(async (tx) => {
		await tx.insert(expense).values({
			id: expenseId,
			organizationId: input.groupId,
			description: input.description,
			notes: input.notes,
			amountMinor: input.amountMinor,
			currency: input.currency,
			paidByUserId: input.paidByUserId,
			splitMethod: input.splitMethod,
			date: input.date,
			createdByUserId: ctx.user.id,
			createdAt: now,
			updatedAt: now,
		});
		await tx.insert(expenseShare).values(
			shares.map((share) => ({
				id: id(),
				expenseId,
				userId: share.userId,
				amountMinor: share.amountMinor,
				splitInput: share.splitInput,
			})),
		);
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"expense.created",
				"expense",
				expenseId,
				{
					description: input.description,
					amountMinor: input.amountMinor,
					currency: input.currency,
				},
			),
			expenseRecipients(input.paidByUserId, input.amountMinor, shares),
		);
	});
	return getExpense(ctx, { expenseId });
}

async function unlockedExpense(ctx: Ctx, expenseId: string) {
	const current = await getExpense(ctx, { expenseId });
	if (current.locked)
		throw new AppError(
			"EXPENSE_LOCKED",
			"A paid share must be unmarked before this expense can be changed",
			{ lockedBy: current.lockedBy },
		);
	return current;
}

export async function updateExpense(ctx: Ctx, input: UpdateExpenseInput) {
	const current = await unlockedExpense(ctx, input.expenseId);
	await assertExpenseMembers(
		ctx,
		current.organizationId,
		input.paidByUserId,
		input.participants.map((row) => row.userId),
	);
	let shares: ReturnType<typeof computeShares>;
	try {
		shares = computeShares(
			input.amountMinor,
			input.splitMethod,
			input.participants,
			input.currency,
		);
	} catch (error) {
		throw new AppError(
			"VALIDATION",
			error instanceof Error ? error.message : "Invalid split",
		);
	}
	await ctx.db.transaction(async (tx) => {
		await tx
			.update(expense)
			.set({
				description: input.description,
				notes: input.notes,
				amountMinor: input.amountMinor,
				currency: input.currency,
				paidByUserId: input.paidByUserId,
				splitMethod: input.splitMethod,
				date: input.date,
				updatedAt: new Date(),
			})
			.where(eq(expense.id, input.expenseId));
		await tx
			.delete(expenseShare)
			.where(eq(expenseShare.expenseId, input.expenseId));
		await tx.insert(expenseShare).values(
			shares.map((share) => ({
				id: id(),
				expenseId: input.expenseId,
				userId: share.userId,
				amountMinor: share.amountMinor,
				splitInput: share.splitInput,
			})),
		);
		await recordActivity(
			tx,
			activityRow(
				current.organizationId,
				ctx.user.id,
				"expense.updated",
				"expense",
				input.expenseId,
				{
					description: input.description,
					fromAmountMinor: current.amountMinor,
					fromCurrency: current.currency,
					amountMinor: input.amountMinor,
					currency: input.currency,
				},
			),
			updatedExpenseRecipients(
				expenseRecipients(
					current.paidByUserId,
					current.amountMinor,
					current.shares,
				),
				expenseRecipients(input.paidByUserId, input.amountMinor, shares),
			),
		);
	});
	return getExpense(ctx, { expenseId: input.expenseId });
}

export async function deleteExpense(ctx: Ctx, input: { expenseId: string }) {
	const current = await unlockedExpense(ctx, input.expenseId);
	await ctx.db.transaction(async (tx) => {
		await recordActivity(
			tx,
			activityRow(
				current.organizationId,
				ctx.user.id,
				"expense.deleted",
				"expense",
				current.id,
				{
					description: current.description,
					amountMinor: current.amountMinor,
					currency: current.currency,
				},
			),
			// What it meant for each of them before it was deleted.
			expenseRecipients(
				current.paidByUserId,
				current.amountMinor,
				current.shares,
			),
		);
		await tx.delete(expense).where(eq(expense.id, current.id));
	});
	return { success: true };
}

export async function setSharePaid(
	ctx: Ctx,
	input: { expenseId: string; userId: string },
	paid: boolean,
) {
	const current = await getExpense(ctx, { expenseId: input.expenseId });
	if (ctx.user.id !== input.userId && ctx.user.id !== current.paidByUserId)
		throw new AppError(
			"FORBIDDEN",
			"Only the share owner or expense payer can change this paid status",
		);
	const share = current.shares.find((row) => row.userId === input.userId);
	if (!share) throw new AppError("NOT_FOUND", "Expense share not found");
	const members = await listMembers(ctx, { groupId: current.organizationId });
	await ctx.db.transaction(async (tx) => {
		const latest = await tx.query.expense.findFirst({
			where: eq(expense.id, input.expenseId),
		});
		const latestShare = await tx.query.expenseShare.findFirst({
			where: eq(expenseShare.id, share.id),
			with: { allocations: true },
		});
		if (!latest || !latestShare)
			throw new AppError("NOT_FOUND", "Expense share not found");
		if (ctx.user.id !== input.userId && ctx.user.id !== latest.paidByUserId)
			throw new AppError(
				"FORBIDDEN",
				"Only the share owner or expense payer can change this paid status",
			);
		if (Boolean(latestShare.paidAt) === paid) return;
		const balances = await readBalances(tx, latest.organizationId, members);
		const invalid = validateSharePayment(balances.transfers, {
			fromUserId: input.userId,
			toUserId: latest.paidByUserId,
			currency: latest.currency,
			amountMinor: latestShare.amountMinor,
			paid,
			hasAllocations: latestShare.allocations.length > 0,
		});
		if (invalid) throw new AppError("VALIDATION", invalid);
		await tx
			.update(expenseShare)
			.set({
				paidAt: paid ? new Date() : null,
				paidMarkedByUserId: paid ? ctx.user.id : null,
			})
			.where(eq(expenseShare.id, share.id));
		await recordActivity(
			tx,
			activityRow(
				current.organizationId,
				ctx.user.id,
				paid ? "share.marked_paid" : "share.marked_unpaid",
				"expenseShare",
				share.id,
				{
					expenseId: current.id,
					userId: input.userId,
					paidByUserId: latest.paidByUserId,
					description: latest.description,
					amountMinor: latestShare.amountMinor,
					currency: latest.currency,
				},
			),
			people(input.userId, latest.paidByUserId),
		);
	});
	return getExpense(ctx, { expenseId: input.expenseId });
}

export async function getBalances(ctx: Ctx, input: { groupId: string }) {
	const members = await listMembers(ctx, input);
	return readBalances(ctx.db, input.groupId, members);
}

async function readBalances(
	db: Pick<Ctx["db"], "query">,
	groupId: string,
	members: { userId: string; name: string }[],
) {
	const expenses = await db.query.expense.findMany({
		where: eq(expense.organizationId, groupId),
		with: { shares: true },
	});
	const settlements = await db.query.settlement.findMany({
		where: eq(settlement.organizationId, groupId),
		with: { allocations: true },
	});
	const balances = computeBalances(
		members.map((row) => ({ userId: row.userId, name: row.name })),
		expenses,
		settlements,
	);
	return { members: balances, transfers: simplifyBalances(balances) };
}

export async function listSettlements(ctx: Ctx, input: { groupId: string }) {
	await membership(ctx, input.groupId);
	return ctx.db.query.settlement.findMany({
		where: eq(settlement.organizationId, input.groupId),
		with: { from: true, to: true, allocations: true },
		orderBy: desc(settlement.createdAt),
	});
}

export async function createSettlement(ctx: Ctx, input: CreateSettlementInput) {
	await membership(ctx, input.groupId);
	if (input.toUserId === ctx.user.id)
		throw new AppError(
			"VALIDATION",
			"A settlement must be between two different members",
		);
	await assertExpenseMembers(ctx, input.groupId, input.toUserId, [ctx.user.id]);
	const members = await listMembers(ctx, input);
	const settlementId = id();
	const now = new Date();
	await ctx.db.transaction(async (tx) => {
		const balances = await readBalances(tx, input.groupId, members);
		const invalid = validateRepayment(balances.transfers, {
			...input,
			fromUserId: ctx.user.id,
		});
		if (invalid) throw new AppError("VALIDATION", invalid);
		const candidates = await tx
			.select({ share: expenseShare, expense })
			.from(expenseShare)
			.innerJoin(expense, eq(expenseShare.expenseId, expense.id))
			.where(
				and(
					eq(expense.organizationId, input.groupId),
					eq(expenseShare.userId, ctx.user.id),
					eq(expense.paidByUserId, input.toUserId),
					eq(expense.currency, input.currency),
					isNull(expenseShare.paidAt),
				),
			)
			.orderBy(asc(expense.date), asc(expense.createdAt));
		await tx.insert(settlement).values({
			id: settlementId,
			organizationId: input.groupId,
			fromUserId: ctx.user.id,
			toUserId: input.toUserId,
			amountMinor: input.amountMinor,
			currency: input.currency,
			note: input.note,
			createdByUserId: ctx.user.id,
			createdAt: now,
		});
		let remaining = input.amountMinor;
		for (const candidate of candidates) {
			if (candidate.share.amountMinor > remaining) break;
			await tx
				.update(expenseShare)
				.set({ paidAt: now, paidMarkedByUserId: ctx.user.id })
				.where(eq(expenseShare.id, candidate.share.id));
			await tx.insert(settlementAllocation).values({
				id: id(),
				settlementId,
				expenseShareId: candidate.share.id,
				amountMinor: candidate.share.amountMinor,
			});
			remaining -= candidate.share.amountMinor;
		}
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"settlement.created",
				"settlement",
				settlementId,
				{
					fromUserId: ctx.user.id,
					toUserId: input.toUserId,
					amountMinor: input.amountMinor,
					currency: input.currency,
				},
			),
			people(ctx.user.id, input.toUserId),
		);
	});
	return ctx.db.query.settlement.findFirst({
		where: eq(settlement.id, settlementId),
		with: { allocations: true },
	});
}

export async function deleteSettlement(
	ctx: Ctx,
	input: { settlementId: string },
) {
	const row = await ctx.db.query.settlement.findFirst({
		where: eq(settlement.id, input.settlementId),
		with: { allocations: true },
	});
	if (!row) throw new AppError("NOT_FOUND", "Settlement not found");
	await membership(ctx, row.organizationId);
	await ctx.db.transaction(async (tx) => {
		if (row.allocations.length)
			await tx
				.update(expenseShare)
				.set({ paidAt: null, paidMarkedByUserId: null })
				.where(
					inArray(
						expenseShare.id,
						row.allocations.map((allocation) => allocation.expenseShareId),
					),
				);
		await recordActivity(
			tx,
			activityRow(
				row.organizationId,
				ctx.user.id,
				"settlement.deleted",
				"settlement",
				row.id,
				{
					fromUserId: row.fromUserId,
					toUserId: row.toUserId,
					amountMinor: row.amountMinor,
					currency: row.currency,
				},
			),
			people(row.fromUserId, row.toUserId),
		);
		await tx.delete(settlement).where(eq(settlement.id, row.id));
	});
	return { success: true };
}

export async function listActivity(
	ctx: Ctx,
	input: { groupId: string; cursor?: string; limit?: number },
) {
	await membership(ctx, input.groupId);
	const clauses = [eq(activity.organizationId, input.groupId)];
	if (input.cursor) clauses.push(lt(activity.id, input.cursor));
	const rows = await ctx.db
		.select({ activity, actorName: user.name })
		.from(activity)
		.innerJoin(user, eq(activity.actorUserId, user.id))
		.where(and(...clauses))
		.orderBy(desc(activity.createdAt), desc(activity.id))
		.limit(input.limit ?? 30);
	return {
		items: rows.map((row) => ({
			...row.activity,
			actorName: row.actorName,
			metadata: JSON.parse(row.activity.metadata),
		})),
		nextCursor:
			rows.length === (input.limit ?? 30) ? rows.at(-1)?.activity.id : null,
	};
}

/**
 * The caller's personal feed: every activity, across every group, that
 * involved them. Membership isn't checked — a recipient row is itself the
 * grant, which is what lets someone see that they were removed from a group.
 *
 * Pages on `(createdAt, activityId)` rather than the id alone, because ids are
 * random UUIDs and would skip or repeat rows that share a timestamp.
 */
export async function listMyActivity(
	ctx: Ctx,
	input: { cursor?: string; limit?: number } = {},
) {
	const limit = Math.min(Math.max(Math.trunc(input.limit || 30), 1), 100);
	const clauses: (SQL | undefined)[] = [
		eq(activityRecipient.userId, ctx.user.id),
	];
	if (input.cursor) {
		const [ms, activityId] = input.cursor.split("_");
		const at = new Date(Number(ms));
		if (!activityId || Number.isNaN(at.getTime()))
			throw new AppError("VALIDATION", "Invalid cursor");
		clauses.push(
			or(
				lt(activityRecipient.createdAt, at),
				and(
					eq(activityRecipient.createdAt, at),
					lt(activityRecipient.activityId, activityId),
				),
			),
		);
	}
	const rows = await ctx.db
		.select({
			activity,
			deltaMinor: activityRecipient.deltaMinor,
			createdAt: activityRecipient.createdAt,
			actorName: user.name,
			groupName: organization.name,
			memberId: member.id,
			expenseId: expense.id,
		})
		.from(activityRecipient)
		.innerJoin(activity, eq(activityRecipient.activityId, activity.id))
		.innerJoin(user, eq(activity.actorUserId, user.id))
		.innerJoin(organization, eq(activity.organizationId, organization.id))
		.leftJoin(
			member,
			and(
				eq(member.organizationId, activity.organizationId),
				eq(member.userId, ctx.user.id),
			),
		)
		.leftJoin(expense, eq(expense.id, activity.targetId))
		.where(and(...clauses))
		.orderBy(
			desc(activityRecipient.createdAt),
			desc(activityRecipient.activityId),
		)
		.limit(limit);

	const items = rows.map((row) => ({
		...row.activity,
		metadata: JSON.parse(row.activity.metadata),
		actorName: row.actorName,
		groupName: row.groupName,
		deltaMinor: row.deltaMinor,
		/** Still in the group, so it's somewhere they can go. */
		isMember: row.memberId !== null,
		/** Set only while the expense this is about still exists. */
		expenseId: row.expenseId,
	}));

	// Metadata stores user ids, not names, so a rename shows everywhere at once.
	const userIds = new Set<string>();
	for (const item of items)
		for (const key of ["userId", "fromUserId", "toUserId", "paidByUserId"]) {
			const value = item.metadata[key];
			if (typeof value === "string") userIds.add(value);
		}
	const names = userIds.size
		? await ctx.db
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(inArray(user.id, [...userIds]))
		: [];

	const last = rows.at(-1);
	return {
		items,
		names: Object.fromEntries(names.map((row) => [row.id, row.name])),
		nextCursor:
			rows.length === limit && last
				? `${last.createdAt.getTime()}_${last.activity.id}`
				: null,
	};
}
