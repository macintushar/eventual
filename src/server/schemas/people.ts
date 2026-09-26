import { z } from "zod";

export const normalizedEmailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email())
	.refine(
		(email) => !email.split("@")[1].endsWith(".invalid"),
		"Use a deliverable email address",
	);
/** Require a country code rather than guessing the caller's country. */
export const phoneSchema = z
	.string()
	.trim()
	.regex(/^\+?[0-9 ()\-.]+$/, "Use an international phone number")
	.transform((phone) => phone.replace(/[ ()\-.]/g, "").replace(/^00/, "+"))
	.pipe(
		z
			.string()
			.regex(
				/^\+[1-9][0-9]{6,14}$/,
				"Include the country code, e.g. +919876543210",
			),
	);
export const memberWeightSchema = z.number().int().safe().positive();
export const addMemberSchema = z.object({
	groupId: z.string().min(1),
	name: z.string().trim().min(1).max(100),
	email: normalizedEmailSchema.optional(),
	phone: phoneSchema.optional(),
	weight: memberWeightSchema.optional(),
});
export const updateMemberWeightSchema = z.object({
	groupId: z.string().min(1),
	userId: z.string().min(1),
	weight: memberWeightSchema,
});
export const mergeGuestSchema = z
	.object({
		guestUserId: z.string().min(1),
		targetUserId: z.string().min(1),
	})
	.refine(
		(input) => input.guestUserId !== input.targetUserId,
		"Choose two different users",
	);
export const requestGuestClaimSchema = z.object({
	email: normalizedEmailSchema,
});
export const claimGuestSchema = z.object({
	token: z.string().regex(/^[a-f0-9]{64}$/),
	password: z.string().min(8).max(128),
	name: z.string().trim().min(1).max(100).optional(),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberWeightInput = z.infer<typeof updateMemberWeightSchema>;
export type MergeGuestInput = z.infer<typeof mergeGuestSchema>;
