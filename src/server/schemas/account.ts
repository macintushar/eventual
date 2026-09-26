import { z } from "zod";

export const createApiKeySchema = z.object({
	name: z.string().trim().min(1).max(64),
	/** Seconds until the key expires; null never expires. */
	expiresIn: z.number().int().positive().nullable(),
});

export const apiKeySummarySchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	/** The first characters of the key, for recognising it. */
	start: z.string().nullable(),
	enabled: z.boolean(),
	expiresAt: z.iso.datetime().nullable(),
	lastRequest: z.iso.datetime().nullable(),
	createdAt: z.iso.datetime(),
});
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;

export const createdApiKeySchema = z.object({
	/** The full secret. It is returned only once, at creation. */
	key: z.string(),
	record: apiKeySummarySchema,
});

export const profileSchema = z.object({
	name: z.string(),
	upiVpa: z.string().nullable(),
	wiseTag: z.string().nullable(),
	emailReminders: z.boolean(),
});
