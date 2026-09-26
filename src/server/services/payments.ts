import { inArray } from "drizzle-orm";
import { user } from "#/db/schema";
import { buildUpiUrl } from "#/lib/upi";
import type { Ctx } from "#/server/context";
import { getBalances } from "./balances";
import { membership } from "./shared";

/**
 * One UPI intent per INR simplified transfer. `manual confirmation` — the
 * payer pays in their UPI app, then calls `createSettlement` to record it —
 * so these are pure read-side intents, never a mutation.
 */
export async function getPaymentIntents(ctx: Ctx, input: { groupId: string }) {
	await membership(ctx, input.groupId);
	const { transfers } = await getBalances(ctx, input);
	const recipients = [
		...new Set(
			transfers
				.filter((transfer) => transfer.currency === "INR")
				.map((transfer) => transfer.to.userId),
		),
	];
	const vpaRows = recipients.length
		? await ctx.db
				.select({ id: user.id, upiVpa: user.upiVpa, name: user.name })
				.from(user)
				.where(inArray(user.id, recipients))
		: [];
	const vpaByUser = new Map(vpaRows.map((row) => [row.id, row.upiVpa ?? null]));
	return {
		intents: transfers
			.filter((transfer) => transfer.currency === "INR")
			.map((transfer) => {
				const vpa = vpaByUser.get(transfer.to.userId);
				return {
					fromUserId: transfer.from.userId,
					fromName: transfer.from.name,
					toUserId: transfer.to.userId,
					toName: transfer.to.name,
					amountMinor: transfer.amountMinor,
					currency: transfer.currency,
					upiUrl: vpa
						? buildUpiUrl({
								pa: vpa,
								pn: transfer.to.name,
								amountMinor: transfer.amountMinor,
								cu: "INR",
							})
						: null,
				};
			}),
	};
}
