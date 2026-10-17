import { z } from "zod";

export const registerPushDeviceSchema = z
	.object({
		platform: z.enum(["ios", "android"]),
		/** Native APNs/FCM token, not an Expo push token. */
		token: z.string().trim().min(1).max(4096),
		appVersion: z.string().trim().min(1).max(100),
		locale: z.string().trim().min(1).max(100),
	})
	.superRefine((value, ctx) => {
		if (value.platform === "ios" && !/^[a-f\d]{64}$/i.test(value.token))
			ctx.addIssue({
				code: "custom",
				path: ["token"],
				message: "Expected a native APNs token",
			});
		if (
			value.token.startsWith("ExponentPushToken[") ||
			value.token.startsWith("ExpoPushToken[")
		)
			ctx.addIssue({
				code: "custom",
				path: ["token"],
				message: "Expected a native device token, not an Expo push token",
			});
	});
export const pushDeviceIdSchema = z.object({ deviceId: z.string().min(1) });
/** Tokens are deliberately not exposed by the device registry responses. */
export const pushDeviceSchema = z.object({
	id: z.string(),
	platform: z.enum(["ios", "android"]),
	appVersion: z.string(),
	locale: z.string(),
	createdAt: z.iso.datetime(),
	lastSeenAt: z.iso.datetime(),
});
export const pushPreferencesSchema = z.object({
	expenses: z.boolean(),
	payments: z.boolean(),
	recurring: z.boolean(),
	mutedGroupIds: z.array(z.string().min(1)).max(1000),
});
export const updatePushPreferencesSchema = pushPreferencesSchema.partial();
export const pushTypes = [
	"expense.created",
	"expense.updated",
	"expense.deleted",
	"settlement.created",
	"settlement.deleted",
	"share.marked_paid",
	"share.marked_unpaid",
	"recurring.generated",
] as const;
/** No financial amounts, descriptions, or notes may be included here. */
export const pushDataSchema = z.object({
	origin: z.url(),
	userId: z.string(),
	groupId: z.string(),
	expenseId: z.string().optional(),
	type: z.enum(pushTypes),
});
export type PushPreferences = z.infer<typeof pushPreferencesSchema>;
export type PushData = z.infer<typeof pushDataSchema>;
