import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import * as s from "#/db/schema";
import type { Ctx } from "#/server/context";
import { AppError } from "#/server/errors";
import {
	type AddMemberInput,
	addMemberSchema,
	type MergeGuestInput,
	mergeGuestSchema,
	type UpdateGuestInput,
	updateGuestSchema,
} from "#/server/schemas/people";
import { deliverInvitation, ensureInvitation } from "./invitations";
import {
	activityRow,
	id,
	type Role,
	recordActivity,
	requirePermission,
} from "./shared";

export async function addMember(ctx: Ctx, raw: AddMemberInput) {
	const input = addMemberSchema.parse(raw);
	const result = await ctx.db.transaction(async (tx) => {
		const mine = await tx.query.member.findFirst({
			where: and(
				eq(s.member.organizationId, input.groupId),
				eq(s.member.userId, ctx.user.id),
			),
		});
		if (!mine)
			throw new AppError("FORBIDDEN", "You are not a member of this group");
		requirePermission(mine.role as Role, { member: ["create"] });
		const role = input.role ?? "member";
		if (role === "owner" && mine.role !== "owner")
			throw new AppError("FORBIDDEN", "Only owners can invite another owner");
		const group = await tx.query.organization.findFirst({
			where: eq(s.organization.id, input.groupId),
		});
		if (!group) throw new AppError("NOT_FOUND", "Group not found");
		const emails = input.email
			? await tx
					.select()
					.from(s.user)
					.where(sql`lower(trim(${s.user.email})) = ${input.email}`)
			: [];
		if (emails.length > 1)
			throw new AppError(
				"CONFLICT",
				"Multiple identities have this normalized email",
			);
		let person: (typeof emails)[number] | undefined = emails[0];
		// Adding the same address again reaches the guest already waiting on it.
		if (!person && input.email) {
			const pending = await tx.query.invitation.findFirst({
				where: and(
					eq(s.invitation.organizationId, input.groupId),
					eq(s.invitation.email, input.email),
					eq(s.invitation.status, "pending"),
					isNotNull(s.invitation.guestUserId),
				),
			});
			if (pending?.guestUserId)
				person = await tx.query.user.findFirst({
					where: eq(s.user.id, pending.guestUserId),
				});
		}
		const phone = input.phone
			? await tx.query.channelIdentity.findFirst({
					where: and(
						eq(s.channelIdentity.channel, "phone"),
						eq(s.channelIdentity.address, input.phone),
					),
				})
			: undefined;
		if (phone) {
			// An existing email lookup (including a pending invitation) must
			// agree with the phone; a new address cannot prove guest ownership.
			if (person && person.id !== phone.userId)
				throw new AppError(
					"CONFLICT",
					"Email and phone identify different people",
				);
			if (!person) {
				const phonePerson = await tx.query.user.findFirst({
					where: eq(s.user.id, phone.userId),
				});
				if (!phonePerson)
					throw new AppError("CONFLICT", "Phone identity has no user");
				if (input.email)
					throw new AppError(
						"CONFLICT",
						"Email and phone identify different people",
					);
				person = phonePerson;
			}
		}
		if (!person) {
			const userId = id();
			[person] = await tx
				.insert(s.user)
				.values({
					id: userId,
					name: input.name,
					// The real address goes on the invitation. A guest holding it
					// could be claimed by whoever controls that inbox.
					email: `guest.${userId}@guests.eventual.invalid`,
					isGuest: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.returning();
		}
		const credentials = await tx.query.account.findFirst({
			where: eq(s.account.userId, person.id),
		});
		if (person.isGuest && credentials)
			throw new AppError("CONFLICT", "Guest identity already has credentials");
		const existing = await tx.query.member.findFirst({
			where: and(
				eq(s.member.organizationId, input.groupId),
				eq(s.member.userId, person.id),
			),
		});
		// Registered users consent through invitation; adding someone cannot change
		// their global profile, phone ownership, or existing membership weight.
		// Weight is ignored here: it's set once they accept (member stays null).
		if (!person.isGuest) {
			if (existing)
				return {
					userId: person.id,
					member: existing,
					invitation: null,
					groupName: group.name,
				};
			if (input.phone && !phone)
				throw new AppError(
					"CONFLICT",
					"Only the account holder can attach a phone to a registered account",
				);
			return {
				userId: person.id,
				member: null,
				invitation: await ensureInvitation(tx, ctx, {
					groupId: input.groupId,
					email: person.email,
					role,
				}),
				groupName: group.name,
			};
		}
		if (input.phone && !phone) {
			// An admin in one group cannot attach a global channel to a guest used
			// in other groups without also administering those groups.
			const groups = await tx.query.member.findMany({
				where: eq(s.member.userId, person.id),
			});
			for (const group of groups) {
				const admin = await tx.query.member.findFirst({
					where: and(
						eq(s.member.organizationId, group.organizationId),
						eq(s.member.userId, ctx.user.id),
					),
				});
				if (!admin || !["owner", "admin"].includes(admin.role))
					throw new AppError(
						"FORBIDDEN",
						"Attaching a global phone requires admin access to every guest group",
					);
			}
			await tx.insert(s.channelIdentity).values({
				id: id(),
				userId: person.id,
				channel: "phone",
				address: input.phone,
			});
		}
		let membership = existing;
		if (!membership) {
			[membership] = await tx
				.insert(s.member)
				.values({
					id: id(),
					organizationId: input.groupId,
					userId: person.id,
					role: "member",
					weight: input.weight ?? 1,
					createdAt: new Date(),
				})
				.returning();
			await recordActivity(
				tx,
				activityRow(
					input.groupId,
					ctx.user.id,
					"member.joined",
					"member",
					membership.id,
					{ userId: person.id, isGuest: true },
				),
				[{ userId: person.id, deltaMinor: null }],
			);
		}
		const invite = input.email
			? await ensureInvitation(tx, ctx, {
					groupId: input.groupId,
					email: input.email,
					role,
					guestUserId: person.id,
				})
			: null;
		return {
			userId: person.id,
			member: membership,
			invitation: invite,
			groupName: group.name,
		};
	});
	return {
		userId: result.userId,
		member: result.member,
		invitation: result.invitation
			? await deliverInvitation(ctx, result.invitation, result.groupName)
			: null,
	};
}

const placeholderDomain = "@guests.eventual.invalid";

/**
 * Admins correct a guest's name, email and phone. A guest's email is the
 * address their invitation goes to, so changing it re-issues that invitation.
 * People with an account manage their own details.
 */
export async function updateGuest(ctx: Ctx, raw: UpdateGuestInput) {
	const input = updateGuestSchema.parse(raw);
	const result = await ctx.db.transaction(async (tx) => {
		const inGroup = (userId: string, groupId = input.groupId) =>
			tx.query.member.findFirst({
				where: and(
					eq(s.member.organizationId, groupId),
					eq(s.member.userId, userId),
				),
			});
		const mine = await inGroup(ctx.user.id);
		if (!mine)
			throw new AppError("FORBIDDEN", "You are not a member of this group");
		requirePermission(mine.role as Role, { member: ["update"] });
		if (!(await inGroup(input.userId)))
			throw new AppError("NOT_FOUND", "Member not found");
		const guest = await tx.query.user.findFirst({
			where: eq(s.user.id, input.userId),
		});
		if (!guest?.isGuest || guest.claimedAt)
			throw new AppError(
				"FORBIDDEN",
				"Only guests can be edited. People with an account manage their own details.",
			);
		// A guest can be in several groups, and these details show in all of them.
		for (const row of await tx.query.member.findMany({
			where: eq(s.member.userId, guest.id),
		})) {
			const admin = await inGroup(ctx.user.id, row.organizationId);
			if (!admin || !["owner", "admin"].includes(admin.role))
				throw new AppError(
					"FORBIDDEN",
					"Editing this guest requires admin access to every group they're in",
				);
		}
		const changed: string[] = [];
		if (input.name !== undefined && input.name !== guest.name) {
			await tx
				.update(s.user)
				.set({ name: input.name, updatedAt: new Date() })
				.where(eq(s.user.id, guest.id));
			changed.push("name");
		}
		if (input.phone !== undefined) {
			const current = await tx.query.channelIdentity.findFirst({
				where: and(
					eq(s.channelIdentity.userId, guest.id),
					eq(s.channelIdentity.channel, "phone"),
				),
			});
			if ((current?.address ?? null) !== input.phone) {
				if (input.phone) {
					const taken = await tx.query.channelIdentity.findFirst({
						where: and(
							eq(s.channelIdentity.channel, "phone"),
							eq(s.channelIdentity.address, input.phone),
						),
					});
					if (taken && taken.userId !== guest.id)
						throw new AppError(
							"CONFLICT",
							"That phone number already belongs to someone else",
						);
				}
				await tx
					.delete(s.channelIdentity)
					.where(
						and(
							eq(s.channelIdentity.userId, guest.id),
							eq(s.channelIdentity.channel, "phone"),
						),
					);
				if (input.phone)
					await tx.insert(s.channelIdentity).values({
						id: id(),
						userId: guest.id,
						channel: "phone",
						address: input.phone,
					});
				changed.push("phone");
			}
		}
		let invite: typeof s.invitation.$inferSelect | null = null;
		if (input.email !== undefined) {
			const pending = await tx.query.invitation.findMany({
				where: and(
					eq(s.invitation.organizationId, input.groupId),
					eq(s.invitation.guestUserId, guest.id),
					eq(s.invitation.status, "pending"),
				),
			});
			// Guests added before invitations carried the address still hold it.
			const legacyEmail = guest.email.endsWith(placeholderDomain)
				? null
				: guest.email;
			const currentEmail = pending[0]?.email ?? legacyEmail;
			if (input.email !== currentEmail) {
				if (
					input.email &&
					pending[0]?.role === "owner" &&
					mine.role !== "owner"
				)
					throw new AppError(
						"FORBIDDEN",
						"Only owners can reissue an owner invitation",
					);
				if (input.email) {
					const owner = await tx.query.user.findFirst({
						where: sql`lower(trim(${s.user.email})) = ${input.email}`,
					});
					if (owner && owner.id !== guest.id) {
						if (owner.isGuest)
							throw new AppError(
								"CONFLICT",
								"Another guest already uses that email",
							);
						if (await inGroup(owner.id))
							throw new AppError(
								"CONFLICT",
								`${owner.name} is already in this group with that email`,
							);
					}
				}
				for (const row of pending) {
					await tx
						.update(s.invitation)
						.set({ status: "canceled" })
						.where(eq(s.invitation.id, row.id));
					await recordActivity(
						tx,
						activityRow(
							input.groupId,
							ctx.user.id,
							"member.invite_revoked",
							"invitation",
							row.id,
							{ email: row.email },
						),
					);
				}
				if (legacyEmail) {
					// Leaving the address on the guest would keep it claimable.
					await tx
						.update(s.user)
						.set({
							email: `guest.${guest.id}${placeholderDomain}`,
							updatedAt: new Date(),
						})
						.where(eq(s.user.id, guest.id));
					await tx
						.delete(s.verification)
						.where(eq(s.verification.identifier, `guest-claim:${guest.id}`));
				}
				if (input.email)
					invite = await ensureInvitation(tx, ctx, {
						groupId: input.groupId,
						email: input.email,
						role: (pending[0]?.role ?? "member") as Role,
						guestUserId: guest.id,
					});
				changed.push("email");
			}
		}
		if (changed.length)
			await recordActivity(
				tx,
				activityRow(
					input.groupId,
					ctx.user.id,
					"member.updated",
					"member",
					guest.id,
					{ userId: guest.id, fields: changed },
				),
			);
		const group = await tx.query.organization.findFirst({
			where: eq(s.organization.id, input.groupId),
		});
		return { invite, groupName: group?.name ?? "" };
	});
	return {
		userId: input.userId,
		invitation: result.invite
			? await deliverInvitation(ctx, result.invite, result.groupName)
			: null,
	};
}

/** Global identity rewrite. Every check and write shares the same transaction.
 * Share collisions are deliberately rejected: coalescing paid flags or allocations
 * would change how settlement deletion restores balances. Resolve these explicitly.
 */
export async function mergeGuest(ctx: Ctx, raw: MergeGuestInput) {
	const { guestUserId: from, targetUserId: to } = mergeGuestSchema.parse(raw);
	if (to !== ctx.user.id)
		throw new AppError(
			"FORBIDDEN",
			"Only the target account holder can approve a guest merge",
		);
	return ctx.db.transaction(async (tx) => {
		const merged = await mergeGuestIdentity(tx, from, to, async (groupIds) => {
			if (!groupIds.size)
				throw new AppError(
					"FORBIDDEN",
					"Guest has no group you can administer",
				);
			for (const groupId of groupIds) {
				const mine = await tx.query.member.findFirst({
					where: and(
						eq(s.member.organizationId, groupId),
						eq(s.member.userId, ctx.user.id),
					),
				});
				if (!mine || !["owner", "admin"].includes(mine.role))
					throw new AppError(
						"FORBIDDEN",
						"Merging requires admin access to every affected group",
					);
			}
			return true;
		});
		if (!merged) throw new AppError("FORBIDDEN", "Guest cannot be merged");
		return merged;
	});
}

type Tx = Parameters<Parameters<Ctx["db"]["transaction"]>[0]>[0];

/**
 * Moves everything a guest owns onto a verified account, then deletes the
 * guest. `authorize` sees every group the guest touches and decides whether
 * the caller may rewrite them; returning false leaves the guest untouched.
 */
export async function mergeGuestIdentity(
	tx: Tx,
	from: string,
	to: string,
	authorize: (groupIds: Set<string>) => Promise<boolean>,
) {
	const guest = await tx.query.user.findFirst({ where: eq(s.user.id, from) });
	const target = await tx.query.user.findFirst({ where: eq(s.user.id, to) });
	if (!guest || !target) throw new AppError("NOT_FOUND", "User not found");
	if (!guest.isGuest || guest.claimedAt)
		throw new AppError(
			"CONFLICT",
			"Only unclaimed guest identities can be merged",
		);
	if (
		target.isGuest ||
		!target.emailVerified ||
		!(await tx.query.account.findFirst({ where: eq(s.account.userId, to) }))
	)
		throw new AppError("CONFLICT", "Target must be a verified registered user");
	// Never transfer credentials, bearer tokens, or cached authorized responses.
	if (
		(await tx.query.account.findFirst({
			where: eq(s.account.userId, from),
		})) ||
		(await tx.query.session.findFirst({
			where: eq(s.session.userId, from),
		})) ||
		(await tx.query.apikey.findFirst({
			where: eq(s.apikey.referenceId, from),
		})) ||
		(await tx.query.idempotencyKey.findFirst({
			where: eq(s.idempotencyKey.userId, from),
		}))
	)
		throw new AppError(
			"CONFLICT",
			"Guest has authentication artifacts; cannot merge",
		);
	// Scheduled payloads are opaque operation input. Refuse rather than leave
	// a dangling embedded identity or accidentally rewrite arbitrary text.
	if (
		(await tx.query.job.findFirst({
			where: sql`instr(${s.job.payload}, ${from}) > 0`,
		})) ||
		(await tx.query.expenseTemplate.findFirst({
			where: sql`instr(${s.expenseTemplate.payload}, ${from}) > 0`,
		}))
	)
		throw new AppError(
			"CONFLICT",
			"Resolve scheduled payloads referencing the guest before merging",
		);
	const memberships = await tx.query.member.findMany({
		where: inArray(s.member.userId, [from, to]),
	});
	const expenses = await tx
		.select({ groupId: s.expense.organizationId })
		.from(s.expense)
		.where(
			or(eq(s.expense.paidByUserId, from), eq(s.expense.createdByUserId, from)),
		);
	const shares = await tx
		.select({
			share: s.expenseShare,
			groupId: s.expense.organizationId,
			payer: s.expense.paidByUserId,
		})
		.from(s.expenseShare)
		.innerJoin(s.expense, eq(s.expense.id, s.expenseShare.expenseId))
		.where(
			or(
				inArray(s.expenseShare.userId, [from, to]),
				eq(s.expenseShare.paidMarkedByUserId, from),
			),
		);
	const settlements = await tx.query.settlement.findMany({
		where: or(
			eq(s.settlement.fromUserId, from),
			eq(s.settlement.toUserId, from),
			eq(s.settlement.createdByUserId, from),
		),
	});
	const activities = await tx.query.activity.findMany({
		where: or(
			eq(s.activity.actorUserId, from),
			eq(s.activity.targetId, from),
			sql`instr(${s.activity.metadata}, ${from}) > 0`,
		),
	});
	const recipients = await tx
		.select({
			recipient: s.activityRecipient,
			groupId: s.activity.organizationId,
		})
		.from(s.activityRecipient)
		.innerJoin(s.activity, eq(s.activity.id, s.activityRecipient.activityId))
		.where(inArray(s.activityRecipient.userId, [from, to]));
	const invites = await tx.query.invitation.findMany({
		where: eq(s.invitation.inviterId, from),
	});
	const templates = await tx.query.expenseTemplate.findMany({
		where: eq(s.expenseTemplate.createdByUserId, from),
	});
	const affected = new Set([
		...memberships
			.filter((m) => m.userId === from)
			.map((m) => m.organizationId),
		...expenses.map((e) => e.groupId),
		...shares
			.filter(
				(r) => r.share.userId === from || r.share.paidMarkedByUserId === from,
			)
			.map((r) => r.groupId),
		...settlements.map((r) => r.organizationId),
		...activities.map((r) => r.organizationId),
		...recipients
			.filter((r) => r.recipient.userId === from)
			.map((r) => r.groupId),
		...invites.map((r) => r.organizationId),
		...templates.map((r) => r.organizationId),
	]);
	if (!(await authorize(affected))) return null;
	for (const row of shares.filter((r) => r.share.userId === from)) {
		if (
			shares.some(
				(other) =>
					other.share.expenseId === row.share.expenseId &&
					other.share.userId === to,
			)
		)
			throw new AppError(
				"CONFLICT",
				"Both identities have shares in the same expense; resolve the share collision first",
			);
	}
	// A payer becoming their own debtor changes paid/allocation meaning.
	if (
		shares.some(
			(r) =>
				(r.share.userId === from && r.payer === to) ||
				(r.share.userId === to && r.payer === from),
		)
	)
		throw new AppError(
			"CONFLICT",
			"Merge would turn an expense debt into a self-share",
		);
	if (
		settlements.some(
			(r) =>
				(r.fromUserId === from && r.toUserId === to) ||
				(r.fromUserId === to && r.toUserId === from),
		)
	)
		throw new AppError("CONFLICT", "Merge would create a self-settlement");
	for (const source of memberships.filter((m) => m.userId === from)) {
		if (source.role !== "member")
			throw new AppError(
				"CONFLICT",
				"Guest must have ordinary member roles before merging",
			);
		const existing = memberships.find(
			(m) => m.userId === to && m.organizationId === source.organizationId,
		);
		if (existing) {
			if (existing.weight !== source.weight)
				throw new AppError("CONFLICT", "Membership weights conflict");
			await tx.delete(s.member).where(eq(s.member.id, source.id));
		} else
			await tx
				.update(s.member)
				.set({ userId: to })
				.where(eq(s.member.id, source.id));
	}
	for (const { recipient: source } of recipients.filter(
		(r) => r.recipient.userId === from,
	)) {
		const existing = recipients.find(
			(r) =>
				r.recipient.activityId === source.activityId &&
				r.recipient.userId === to,
		)?.recipient;
		if (existing) {
			const delta =
				source.deltaMinor === null && existing.deltaMinor === null
					? null
					: (source.deltaMinor ?? 0) + (existing.deltaMinor ?? 0);
			if (delta !== null && !Number.isSafeInteger(delta))
				throw new AppError("CONFLICT", "Activity delta overflow");
			await tx
				.update(s.activityRecipient)
				.set({ deltaMinor: delta })
				.where(
					and(
						eq(s.activityRecipient.activityId, source.activityId),
						eq(s.activityRecipient.userId, to),
					),
				);
			await tx
				.delete(s.activityRecipient)
				.where(
					and(
						eq(s.activityRecipient.activityId, source.activityId),
						eq(s.activityRecipient.userId, from),
					),
				);
		} else
			await tx
				.update(s.activityRecipient)
				.set({ userId: to })
				.where(
					and(
						eq(s.activityRecipient.activityId, source.activityId),
						eq(s.activityRecipient.userId, from),
					),
				);
	}
	await tx
		.update(s.expenseShare)
		.set({ userId: to })
		.where(eq(s.expenseShare.userId, from));
	await tx
		.update(s.expenseShare)
		.set({ paidMarkedByUserId: to })
		.where(eq(s.expenseShare.paidMarkedByUserId, from));
	await tx
		.update(s.expense)
		.set({ paidByUserId: to })
		.where(eq(s.expense.paidByUserId, from));
	await tx
		.update(s.expense)
		.set({ createdByUserId: to })
		.where(eq(s.expense.createdByUserId, from));
	await tx
		.update(s.settlement)
		.set({ fromUserId: to })
		.where(eq(s.settlement.fromUserId, from));
	await tx
		.update(s.settlement)
		.set({ toUserId: to })
		.where(eq(s.settlement.toUserId, from));
	await tx
		.update(s.settlement)
		.set({ createdByUserId: to })
		.where(eq(s.settlement.createdByUserId, from));
	await tx
		.update(s.invitation)
		.set({ inviterId: to })
		.where(eq(s.invitation.inviterId, from));
	await tx
		.update(s.expenseTemplate)
		.set({ createdByUserId: to })
		.where(eq(s.expenseTemplate.createdByUserId, from));
	await tx
		.update(s.channelIdentity)
		.set({ userId: to })
		.where(eq(s.channelIdentity.userId, from));
	for (const row of activities) {
		await tx
			.update(s.activity)
			.set({
				actorUserId: row.actorUserId === from ? to : row.actorUserId,
				targetId: row.targetId === from ? to : row.targetId,
				metadata: JSON.stringify(
					replaceIdentity(JSON.parse(row.metadata), from, to),
				),
			})
			.where(eq(s.activity.id, row.id));
	}
	// Claims are bound to the original id/email; revoke them with the identity.
	await tx
		.delete(s.verification)
		.where(eq(s.verification.identifier, `guest-claim:${from}`));
	await tx.delete(s.user).where(eq(s.user.id, from));
	return {
		userId: to,
		mergedGuestUserId: from,
		groupIds: [...affected].sort(),
	};
}

function replaceIdentity(value: unknown, from: string, to: string): unknown {
	if (value === from) return to;
	if (Array.isArray(value))
		return value.map((v) => replaceIdentity(v, from, to));
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([key, v]) => [
				key === from ? to : key,
				replaceIdentity(v, from, to),
			]),
		);
	return value;
}
