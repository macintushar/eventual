import { and, desc, eq, gte } from "drizzle-orm";
import { invitation, member, organization, user } from "#/db/schema";
import { emailKey } from "#/lib/auth-email";
import { runInBackground } from "#/server/background";
import type { Ctx } from "#/server/context";
import { people } from "#/server/domain/activity";
import { AppError } from "#/server/errors";
import {
	activityRow,
	id,
	membership,
	type Role,
	recordActivity,
	requireRole,
} from "./shared";

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
	const created = await ctx.db.transaction((tx) =>
		ensureInvitation(tx, ctx, input),
	);
	return deliverInvitation(ctx, created, group.name);
}

/** Internal transaction seam shared with eager guest membership creation. */
export async function ensureInvitation(
	tx: Pick<Ctx["db"], "query" | "insert">,
	ctx: Ctx,
	input: { groupId: string; email: string; role: Role },
) {
	const normalizedEmail = input.email.trim().toLowerCase();
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
}

export async function deliverInvitation(
	ctx: Ctx,
	created: typeof invitation.$inferSelect,
	groupName: string,
) {
	let emailDelivery: "scheduled" | "unconfigured" = "unconfigured";
	if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
		const [{ env }, { sendEmail }] = await Promise.all([
			import("#/env"),
			import("#/server/email"),
		]);
		runInBackground(
			sendEmail(
				created.email,
				{
					kind: "invitation",
					url: new URL(`/invite/${created.id}`, env.BETTER_AUTH_URL).toString(),
					groupName,
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
	const currentUser = await ctx.db.query.user.findFirst({
		where: eq(user.id, ctx.user.id),
	});
	if (!currentUser || currentUser.isGuest || !currentUser.emailVerified)
		throw new AppError(
			"FORBIDDEN",
			"Verify your email before accepting an invitation",
		);
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
