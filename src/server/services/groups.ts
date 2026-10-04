import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { member, organization, session, user } from "#/db/schema";
import type { Ctx } from "#/server/context";
import { AppError } from "#/server/errors";
import type { CreateGroupInput } from "#/server/schemas";
import { readGroupSummaries } from "./balances";
import { listMembers } from "./members";
import {
	activityRow,
	id,
	membership,
	recordActivity,
	requirePermission,
} from "./shared";

export async function listGroups(ctx: Ctx) {
	return groupsFromSummaries(ctx.user.id, await readGroupSummaries(ctx));
}

export function groupsFromSummaries(
	userId: string,
	rows: Awaited<ReturnType<typeof readGroupSummaries>>,
) {
	return rows.map(({ organization: group, role, balances }) => ({
		...group,
		role,
		balances: balances
			.filter((row) => row.userId === userId)
			.map(({ currency, balanceMinor }) => ({ currency, balanceMinor })),
	}));
}

export async function listGroupDirectory(ctx: Ctx) {
	return ctx.db
		.select({
			id: organization.id,
			name: organization.name,
			archivedAt: organization.archivedAt,
		})
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, ctx.user.id))
		.orderBy(asc(organization.name), asc(organization.id));
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
		.where(and(eq(member.userId, ctx.user.id), isNull(organization.archivedAt)))
		.orderBy(asc(organization.name));
	if (!rows.length) return [];
	const groupIds = rows.map((row) => row.id);
	const memberRows = await ctx.db
		.select({
			organizationId: member.organizationId,
			userId: user.id,
			name: user.name,
			image: user.image,
			weight: member.weight,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(inArray(member.organizationId, groupIds))
		.orderBy(asc(user.name));
	const byGroup = new Map(
		groupIds.map((groupId) => [
			groupId,
			[] as {
				userId: string;
				name: string;
				image: string | null;
				weight: number;
			}[],
		]),
	);
	for (const row of memberRows)
		byGroup.get(row.organizationId)?.push({
			userId: row.userId,
			name: row.name,
			image: row.image,
			weight: row.weight,
		});
	return rows.map((row) => ({ ...row, members: byGroup.get(row.id) ?? [] }));
}

export async function archiveGroup(ctx: Ctx, input: { groupId: string }) {
	const mine = await membership(ctx, input.groupId);
	requirePermission(mine.role, { group: ["update"] });
	await ctx.db.transaction(async (tx) => {
		const group = await tx.query.organization.findFirst({
			where: eq(organization.id, input.groupId),
		});
		if (!group) throw new AppError("NOT_FOUND", "Group not found");
		if (group.archivedAt)
			throw new AppError("VALIDATION", "Group is already archived");
		await tx
			.update(organization)
			.set({ archivedAt: new Date() })
			.where(eq(organization.id, input.groupId));
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"group.archived",
				"group",
				input.groupId,
			),
		);
	});
	return getGroup(ctx, input);
}

export async function unarchiveGroup(ctx: Ctx, input: { groupId: string }) {
	const mine = await membership(ctx, input.groupId);
	requirePermission(mine.role, { group: ["update"] });
	await ctx.db.transaction(async (tx) => {
		const group = await tx.query.organization.findFirst({
			where: eq(organization.id, input.groupId),
		});
		if (!group) throw new AppError("NOT_FOUND", "Group not found");
		if (!group.archivedAt)
			throw new AppError("VALIDATION", "Group is not archived");
		await tx
			.update(organization)
			.set({ archivedAt: null })
			.where(eq(organization.id, input.groupId));
		await recordActivity(
			tx,
			activityRow(
				input.groupId,
				ctx.user.id,
				"group.unarchived",
				"group",
				input.groupId,
			),
		);
	});
	return getGroup(ctx, input);
}

/**
 * Archives never hide money: archived groups stay readable and settleable, so
 * only the composer filters them out. `listGroups` still returns them, with
 * `archivedAt` carried on the group row for any surface that wants the flag.
 */
export async function duplicateGroup(
	ctx: Ctx,
	input: { groupId: string; name?: string },
) {
	const mine = await membership(ctx, input.groupId);
	requirePermission(mine.role, { group: ["update"] });
	const source = await ctx.db.query.organization.findFirst({
		where: eq(organization.id, input.groupId),
	});
	if (!source) throw new AppError("NOT_FOUND", "Group not found");
	const newGroupId = id();
	const name = input.name?.trim() || `${source.name} (copy)`;
	const now = new Date();
	await ctx.db.transaction(async (tx) => {
		await tx.insert(organization).values({
			id: newGroupId,
			name,
			slug: slugify(name, newGroupId),
			createdAt: now,
		});
		const sourceMembers = await tx
			.select({
				userId: member.userId,
				role: member.role,
				weight: member.weight,
			})
			.from(member)
			.where(eq(member.organizationId, input.groupId));
		if (!sourceMembers.length)
			throw new AppError("VALIDATION", "Source group has no members");
		await tx.insert(member).values(
			sourceMembers.map((sourceMember) => ({
				id: id(),
				organizationId: newGroupId,
				userId: sourceMember.userId,
				role: sourceMember.userId === ctx.user.id ? "owner" : sourceMember.role,
				weight: sourceMember.weight,
				createdAt: now,
			})),
		);
		await recordActivity(
			tx,
			activityRow(
				newGroupId,
				ctx.user.id,
				"group.duplicated",
				"group",
				newGroupId,
				{ fromGroupId: input.groupId, fromName: source.name, name },
			),
		);
	});
	return getGroup(ctx, { groupId: newGroupId });
}

function slugify(name: string, groupId: string) {
	return `${
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "group"
	}-${groupId.slice(0, 6)}`;
}

export async function createGroup(ctx: Ctx, input: CreateGroupInput) {
	const groupId = id();
	const now = new Date();
	const slug = input.slug ?? slugify(input.name, groupId);
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
	if (ctx.session && ctx.session.activeOrganizationId !== input.groupId)
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
	requirePermission(mine.role, { group: ["update"] });
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
	requirePermission(mine.role, { group: ["delete"] });
	await ctx.db.delete(organization).where(eq(organization.id, input.groupId));
	return { success: true };
}

export { renameGroup as updateGroup };
