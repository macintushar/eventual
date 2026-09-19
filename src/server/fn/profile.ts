import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

import { user } from "#/db/schema";
import { routeContext } from "#/server/fn/route-context";
import { updateProfileSchema } from "#/server/schemas";

/**
 * Writes straight to the user row rather than through better-auth's
 * update-user endpoint, which would accept the payment handles unvalidated.
 */
export const updateProfileFn = createServerFn({ method: "POST" })
	.validator(updateProfileSchema)
	.handler(async ({ data }) => {
		const ctx = await routeContext();
		const [row] = await ctx.db
			.update(user)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(user.id, ctx.user.id))
			.returning({
				name: user.name,
				upiVpa: user.upiVpa,
				wiseTag: user.wiseTag,
				emailReminders: user.emailReminders,
			});
		return row;
	});
