import { and, desc, eq, gte } from "drizzle-orm";
import { invitation, member, organization, user } from "#/db/schema";
import { emailKey } from "#/lib/auth-email";
import { runInBackground } from "#/server/background";
import type { Ctx } from "#/server/context";
import { people } from "#/server/domain/activity";
import { AppError } from "#/server/errors";
import { mergeGuestIdentity } from "./guests";
import {
	activityRow,
	id,
	membership,
	type Role,
	recordActivity,
	requirePermission,
} from "./shared";

export async function listInvitations(ctx: Ctx, input: { groupId: string }) {
	const mine = await membership(ctx, input.groupId);
	requirePermission(mine.role, { invitation: ["read"] });
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
	requirePermission(mine.role, { invitation: ["create"] });
	if (input.role === "owner")
		throw new AppError("FORBIDDEN", "Each group has one owner");
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
	tx: Pick<Ctx["db"], "query" | "insert" | "update">,
	ctx: Ctx,
	input: {
		groupId: string;
		email: string;
		role: Role;
		/** The guest who stands in for this person until they accept. */
		guestUserId?: string | null;
	},
) {
	const normalizedEmail = input.email.trim().toLowerCase();
	const guestUserId = input.guestUserId ?? null;
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
		if (guestUserId && existing.guestUserId !== guestUserId) {
			if (existing.guestUserId)
				throw new AppError(
					"CONFLICT",
					"That email is already invited for another person in this group",
				);
			await tx
				.update(invitation)
				.set({ guestUserId })
				.where(eq(invitation.id, existing.id));
			return { ...existing, guestUserId };
		}
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
		guestUserId,
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
	requirePermission(mine.role, { invitation: ["cancel"] });
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
	return { success: true, groupId: invite.organizationId };
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
	const groupId = preview.invitation.organizationId;
	const role = preview.invitation.role ?? "member";
	await ctx.db.transaction(async (tx) => {
		// The guest who stood in for this person becomes them: their shares,
		// payments and history move to the account. The admin's invitation is the
		// consent, so this only touches the group that sent it.
		const guestId = preview.invitation.guestUserId;
		const guest = guestId
			? await tx.query.user.findFirst({ where: eq(user.id, guestId) })
			: undefined;
		const merged =
			guest?.isGuest && !guest.claimedAt
				? await mergeGuestIdentity(
						tx,
						guest.id,
						ctx.user.id,
						async (groupIds) =>
							groupIds.size > 0 &&
							[...groupIds].every((affected) => affected === groupId),
					)
				: null;
		// A legacy guest who claimed their account already is this user: they own
		// the membership and history, so there is nothing to transfer.
		const alreadyOwned = guest?.id === ctx.user.id;
		if (guestId && !merged && !alreadyOwned)
			throw new AppError(
				"CONFLICT",
				"This guest could not be transferred. Ask an admin to resolve their identity across groups before accepting.",
			);
		const existing = await tx.query.member.findFirst({
			where: and(
				eq(member.organizationId, groupId),
				eq(member.userId, ctx.user.id),
			),
		});
		if (!existing)
			await tx.insert(member).values({
				id: id(),
				organizationId: groupId,
				userId: ctx.user.id,
				role,
				createdAt: new Date(),
			});
		else if ((merged || alreadyOwned) && existing.role !== role)
			await tx.update(member).set({ role }).where(eq(member.id, existing.id));
		await tx
			.update(invitation)
			.set({ status: "accepted" })
			.where(eq(invitation.id, input.invitationId));
		await recordActivity(
			tx,
			activityRow(
				groupId,
				ctx.user.id,
				"member.joined",
				"member",
				ctx.user.id,
				{
					...(merged ? { replacedGuestName: guest?.name } : {}),
				},
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
