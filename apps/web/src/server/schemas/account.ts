import { z } from "zod";

export const createApiKeySchema = z.object({
	name: z.string().trim().min(1).max(64),
	/** Seconds until the key expires; null never expires. */
	expiresIn: z.number().int().positive().nullable(),
	/**
	 * Access preset. `custom` requires `permissions`; presets ignore it.
	 * Defaults to the least powerful preset so an old client can't mint a
	 * full-access key by accident.
	 */
	mode: z
		.enum(["transactional", "management", "full", "custom"])
		.default("transactional"),
	/** Better Auth permission map, validated against #/lib/permissions. */
	permissions: z.record(z.string(), z.array(z.string())).optional(),
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
	/** Resolved from stored permissions; `legacy` keys predate scopes. */
	mode: z.enum(["transactional", "management", "full", "custom", "legacy"]),
});
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;

export const createdApiKeySchema = z.object({
	/** The full secret. It is returned only once, at creation. */
	key: z.string(),
	record: apiKeySummarySchema,
});

export const profileSchema = z.object({
	name: z.string(),
	image: z.string().nullable(),
	upiVpa: z.string().nullable(),
	wiseTag: z.string().nullable(),
	emailReminders: z.boolean(),
	/** The saved profile, so the form can reset to exactly what is stored. */
	bio: z.string().nullable(),
	phone: z.string().nullable(),
	isEmailPublic: z.boolean(),
	isPhonePublic: z.boolean(),
});
