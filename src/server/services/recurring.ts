import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "#/db";
import { expenseTemplate, job, member, organization, user } from "#/db/schema";
import type { Ctx } from "#/server/context";
import { AppError } from "#/server/errors";
import {
	type ClaimedJob,
	completeJob,
	enqueueJob,
	ownedJob,
} from "#/server/jobs";
import { createExpenseSchema } from "#/server/schemas";
import {
	createRecurringExpenseSchema,
	recurringExpensePayloadSchema,
	updateRecurringExpenseSchema,
} from "#/server/schemas/automation";
import { createExpense, previewExpense } from "./expenses";
import { assertExpenseMembers, membership } from "./shared";

type Recurrence = typeof expenseTemplate.$inferSelect.recurrence;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Flatten service-owned transactions into the caller's atomic unit. Errors must escape the outer callback. */
export function transactionDatabase(tx: Transaction): Database {
	return new Proxy(tx, {
		get(target, property) {
			if (property === "transaction")
				return async (callback: (nested: Transaction) => Promise<unknown>) =>
					callback(tx);
			const value = Reflect.get(target, property);
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as unknown as Database;
}

/** Keep the original day (and end-of-month intent) after short months and leap years. */
export function nextRecurrence(
	current: Date,
	recurrence: Recurrence,
	anchor: Date = current,
) {
	const next = new Date(current);
	if (recurrence === "daily" || recurrence === "weekly")
		next.setUTCDate(next.getUTCDate() + (recurrence === "daily" ? 1 : 7));
	else {
		const endOfMonth =
			anchor.getUTCDate() ===
			new Date(
				Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0),
			).getUTCDate();
		next.setUTCDate(1);
		if (recurrence === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
		else next.setUTCFullYear(next.getUTCFullYear() + 1);
		const lastDay = new Date(
			Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
		).getUTCDate();
		next.setUTCDate(
			endOfMonth ? lastDay : Math.min(anchor.getUTCDate(), lastDay),
		);
	}
	return next;
}

async function queueTemplate(
	db: Pick<Database, "insert">,
	template: typeof expenseTemplate.$inferSelect,
	revision: string,
) {
	if (!template.active) return;
	return enqueueJob(db, {
		kind: "recurring-expense",
		dueAt: template.nextRunAt,
		payload: {
			templateId: template.id,
			scheduledAt: template.nextRunAt.toISOString(),
			revision,
		},
		dedupeKey: `recurring:${template.id}:${template.nextRunAt.toISOString()}:${revision}`,
	});
}

async function validatePayload(
	ctx: Ctx,
	groupId: string,
	payload: z.infer<typeof recurringExpensePayloadSchema>,
) {
	await assertExpenseMembers(
		ctx,
		groupId,
		payload.paidByUserId,
		payload.participants.map((p) => p.userId),
	);
	previewExpense(payload);
}

export async function createRecurringExpense(
	ctx: Ctx,
	input: z.infer<typeof createRecurringExpenseSchema>,
) {
	const parsed = createRecurringExpenseSchema.parse(input);
	await membership(ctx, parsed.groupId);
	await validatePayload(ctx, parsed.groupId, parsed.payload);
	return ctx.db.transaction(async (tx) => {
		const [template] = await tx
			.insert(expenseTemplate)
			.values({
				id: crypto.randomUUID(),
				organizationId: parsed.groupId,
				createdByUserId: ctx.user.id,
				recurrence: parsed.recurrence,
				nextRunAt: parsed.nextRunAt,
				active: parsed.active,
				payload: JSON.stringify({
					expense: parsed.payload,
					anchor: parsed.nextRunAt.toISOString(),
				}),
			})
			.returning();
		await queueTemplate(tx, template, crypto.randomUUID());
		return template;
	});
}

export async function listRecurringExpenses(
	ctx: Ctx,
	input: { groupId: string },
) {
	await membership(ctx, input.groupId);
	return ctx.db
		.select()
		.from(expenseTemplate)
		.where(eq(expenseTemplate.organizationId, input.groupId));
}

async function editableTemplate(ctx: Ctx, templateId: string) {
	const template = await ctx.db.query.expenseTemplate.findFirst({
		where: eq(expenseTemplate.id, templateId),
	});
	if (!template) throw new AppError("NOT_FOUND", "Recurring expense not found");
	const membershipRow = await membership(ctx, template.organizationId);
	if (
		template.createdByUserId !== ctx.user.id &&
		!["owner", "admin"].includes(membershipRow.role)
	)
		throw new AppError(
			"FORBIDDEN",
			"Only the creator or a group admin can edit recurring expenses",
		);
	return template;
}

export async function updateRecurringExpense(
	ctx: Ctx,
	input: z.infer<typeof updateRecurringExpenseSchema>,
) {
	const parsed = updateRecurringExpenseSchema.parse(input);
	return ctx.db.transaction(async (tx) => {
		const scoped = { ...ctx, db: transactionDatabase(tx) };
		const template = await editableTemplate(scoped, parsed.templateId);
		const stored = JSON.parse(template.payload);
		const payload =
			parsed.payload ?? recurringExpensePayloadSchema.parse(stored.expense);
		await validatePayload(scoped, template.organizationId, payload);
		const [updated] = await tx
			.update(expenseTemplate)
			.set({
				recurrence: parsed.recurrence ?? template.recurrence,
				nextRunAt: parsed.nextRunAt ?? template.nextRunAt,
				active: parsed.active ?? template.active,
				payload: JSON.stringify({
					expense: payload,
					anchor: parsed.nextRunAt?.toISOString() ?? stored.anchor,
				}),
			})
			.where(eq(expenseTemplate.id, template.id))
			.returning();
		await queueTemplate(tx, updated, crypto.randomUUID());
		return updated;
	});
}

export async function deleteRecurringExpense(
	ctx: Ctx,
	input: { templateId: string },
) {
	return ctx.db.transaction(async (tx) => {
		await editableTemplate(
			{ ...ctx, db: transactionDatabase(tx) },
			input.templateId,
		);
		await tx
			.delete(expenseTemplate)
			.where(eq(expenseTemplate.id, input.templateId));
		return { success: true };
	});
}

const materializationSchema = z.object({
	templateId: z.string(),
	scheduledAt: z.coerce.date(),
	revision: z.string().default("legacy"),
});
const storedPayloadSchema = z.object({
	expense: recurringExpensePayloadSchema,
	anchor: z.coerce.date(),
});

export async function materializeRecurringExpense(
	db: Database,
	claimed: ClaimedJob,
) {
	const input = materializationSchema.parse(JSON.parse(claimed.payload));
	await db.transaction(async (tx) => {
		// Acquire the write lock and fence stale workers before any domain writes.
		const owned = await tx
			.update(job)
			.set({ lockedAt: new Date() })
			.where(ownedJob(claimed))
			.returning();
		if (!owned.length) return;
		const template = await tx.query.expenseTemplate.findFirst({
			where: and(
				eq(expenseTemplate.id, input.templateId),
				eq(expenseTemplate.active, true),
				eq(expenseTemplate.nextRunAt, input.scheduledAt),
			),
		});
		if (template) {
			const creator = await tx.query.user.findFirst({
				where: eq(user.id, template.createdByUserId),
			});
			const group = await tx.query.organization.findFirst({
				where: eq(organization.id, template.organizationId),
			});
			const creatorMembership = await tx.query.member.findFirst({
				where: and(
					eq(member.organizationId, template.organizationId),
					eq(member.userId, template.createdByUserId),
				),
			});
			if (!creator || !creatorMembership || !group || group.archivedAt) {
				await tx
					.update(expenseTemplate)
					.set({ active: false })
					.where(eq(expenseTemplate.id, template.id));
			} else {
				const stored = storedPayloadSchema.parse(JSON.parse(template.payload));
				// Expense services use user identity only; no authenticated session is fabricated.
				const now = new Date();
				const ctx: Ctx = {
					db: transactionDatabase(tx),
					user: creator,
					apiKeyId: null,
					session: {
						id: `job:${claimed.id}`,
						userId: creator.id,
						token: `job:${claimed.id}`,
						expiresAt: now,
						createdAt: now,
						updatedAt: now,
						ipAddress: null,
						userAgent: "eventual-job-runner",
						activeOrganizationId: template.organizationId,
					},
				};
				await createExpense(
					ctx,
					createExpenseSchema.parse({
						...stored.expense,
						groupId: template.organizationId,
						date: template.nextRunAt,
					}),
				);
				const nextRunAt = nextRecurrence(
					template.nextRunAt,
					template.recurrence,
					stored.anchor,
				);
				await tx
					.update(expenseTemplate)
					.set({ nextRunAt })
					.where(eq(expenseTemplate.id, template.id));
				await queueTemplate(tx, { ...template, nextRunAt }, input.revision);
			}
		}
		await completeJob(tx, claimed);
	});
}
