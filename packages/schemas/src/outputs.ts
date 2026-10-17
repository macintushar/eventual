/**
 * Response bodies, as they arrive over the wire.
 *
 * Every schema describes JSON, so timestamps are ISO 8601 strings even where
 * the server holds a `Date`. The web app checks each one against what its
 * handlers actually return (see `apps/web/src/server/contract.check.ts`), so a
 * field added or removed on the server fails the typecheck until it lands here.
 */
import { z } from "zod";

/** A `Date` on the server, serialized by `JSON.stringify`. */
export const timestampSchema = z.iso.datetime();

export const activityTypes = [
	"group.created",
	"group.renamed",
	"group.archived",
	"group.unarchived",
	"group.duplicated",
	"group.deleted",
	"member.invited",
	"member.invite_revoked",
	"member.joined",
	"member.removed",
	"member.left",
	"member.role_changed",
	"member.updated",
	"expense.created",
	"expense.updated",
	"expense.deleted",
	"share.marked_paid",
	"share.marked_unpaid",
	"settlement.created",
	"settlement.deleted",
] as const;
export const activityTypeSchema = z.enum(activityTypes);

export const successSchema = z.object({ success: z.boolean() });
export const groupSuccessSchema = successSchema.extend({ groupId: z.string() });

/** Who is asking: a trimmed user row that page payloads carry. */
export const viewerSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});

/** A full user row, as expense and settlement payloads embed it. */
export const userRecordSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	emailVerified: z.boolean(),
	image: z.string().nullable(),
	upiVpa: z.string().nullable(),
	wiseTag: z.string().nullable(),
	bio: z.string().nullable(),
	isEmailPublic: z.boolean(),
	isPhonePublic: z.boolean(),
	isGuest: z.boolean(),
	claimedAt: timestampSchema.nullable(),
	emailReminders: z.boolean(),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
});

// Groups and members

export const groupRecordSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	logo: z.string().nullable(),
	metadata: z.string().nullable(),
	createdAt: timestampSchema,
	archivedAt: timestampSchema.nullable(),
});

export const memberSchema = z.object({
	id: z.string(),
	userId: z.string(),
	name: z.string(),
	image: z.string().nullable(),
	/** Null unless the member made it public or the caller may see it. */
	email: z.string().nullable(),
	phone: z.string().nullable(),
	invitedEmail: z.string().nullable(),
	upiVpa: z.string().nullable(),
	wiseTag: z.string().nullable(),
	bio: z.string().nullable(),
	isEmailPublic: z.boolean(),
	isPhonePublic: z.boolean(),
	role: z.string(),
	weight: z.number(),
	isGuest: z.boolean(),
	claimedAt: timestampSchema.nullable(),
	createdAt: timestampSchema,
});

export const groupDetailSchema = groupRecordSchema.extend({
	myRole: z.enum(["owner", "admin", "member"]),
	members: z.array(memberSchema),
});

export const groupBalanceSchema = z.object({
	currency: z.string(),
	balanceMinor: z.number(),
});

export const groupSummarySchema = groupRecordSchema.extend({
	role: z.string(),
	/** The caller's own balance in this group, per currency. */
	balances: z.array(groupBalanceSchema),
});

export const groupDirectoryEntrySchema = z.object({
	id: z.string(),
	name: z.string(),
	archivedAt: timestampSchema.nullable(),
});

export const composerGroupSchema = z.object({
	id: z.string(),
	name: z.string(),
	members: z.array(
		z.object({
			userId: z.string(),
			name: z.string(),
			image: z.string().nullable(),
			weight: z.number(),
		}),
	),
});

export const membershipRecordSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	userId: z.string(),
	role: z.string(),
	weight: z.number(),
	createdAt: timestampSchema,
});

// Invitations

export const invitationRecordSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	email: z.string(),
	role: z.string().nullable(),
	status: z.string(),
	expiresAt: timestampSchema,
	createdAt: timestampSchema,
	inviterId: z.string(),
	guestUserId: z.string().nullable(),
});

export const invitationDetailSchema = z.object({
	invitation: invitationRecordSchema,
	groupName: z.string(),
	inviterName: z.string(),
});

export const invitationDeliverySchema = z.object({
	invitationId: z.string(),
	inviteUrl: z.string(),
	emailDelivery: z.enum(["scheduled", "unconfigured"]),
});

export const addMemberResultSchema = z.object({
	userId: z.string(),
	/** Everyone added joins straight away, with or without an account. */
	member: membershipRecordSchema,
	invitation: invitationDeliverySchema.nullable(),
});

export const updateGuestResultSchema = z.object({
	userId: z.string(),
	invitation: invitationDeliverySchema.nullable(),
});

export const mergeGuestResultSchema = z.object({
	userId: z.string(),
	mergedGuestUserId: z.string(),
	groupIds: z.array(z.string()),
});

// Expenses

const splitMethodSchema = z.enum(["even", "exact", "shares", "percent"]);

export const allocationSchema = z.object({
	id: z.string(),
	settlementId: z.string(),
	expenseShareId: z.string(),
	amountMinor: z.number(),
});

export const expenseShareSchema = z.object({
	id: z.string(),
	expenseId: z.string(),
	userId: z.string(),
	amountMinor: z.number(),
	splitInput: z.number().nullable(),
	paidAt: timestampSchema.nullable(),
	paidMarkedByUserId: z.string().nullable(),
	user: userRecordSchema,
});

const expenseRecordSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	description: z.string(),
	notes: z.string().nullable(),
	category: z.string().nullable(),
	searchText: z.string(),
	amountMinor: z.number(),
	currency: z.string(),
	splitMethod: splitMethodSchema,
	date: timestampSchema,
	paidByUserId: z.string(),
	createdByUserId: z.string(),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
	/** A settled share pins the split; edits that move money are refused. */
	locked: z.boolean(),
	payer: userRecordSchema,
});

/** One expense with its shares, settlement allocations and who locked it. */
export const expenseDetailSchema = expenseRecordSchema.extend({
	lockedBy: z.array(
		z.object({
			userId: z.string(),
			name: z.string(),
			paidAt: timestampSchema.nullable(),
		}),
	),
	shares: z.array(
		expenseShareSchema.extend({ allocations: z.array(allocationSchema) }),
	),
	creator: userRecordSchema,
});

export const expenseListItemSchema = expenseRecordSchema.extend({
	shares: z.array(expenseShareSchema),
});

/** Offset pages carry `asOf`; cursor pages carry `nextCursor`. Never both. */
export const expenseListSchema = z.union([
	z.object({
		items: z.array(expenseListItemSchema),
		nextCursor: z.null(),
		nextOffset: z.number().nullable(),
		asOf: z.number(),
	}),
	z.object({
		items: z.array(expenseListItemSchema),
		nextCursor: z.string().nullable(),
		nextOffset: z.null(),
		asOf: z.null(),
	}),
]);

export const expensePageResultSchema = z.object({
	items: z.array(
		z.object({
			id: z.string(),
			organizationId: z.string(),
			description: z.string(),
			date: timestampSchema,
			category: z.string().nullable(),
			amountMinor: z.number(),
			currency: z.string(),
			payer: z.object({
				id: z.string(),
				name: z.string(),
				image: z.string().nullable(),
			}),
			locked: z.boolean(),
		}),
	),
	nextCursor: z.string().nullable(),
});

export const computedShareSchema = z.object({
	userId: z.string(),
	input: z.number().nullable(),
	weight: z.number().optional(),
	amountMinor: z.number(),
	splitInput: z.number().nullable(),
});

export const bulkResplitResultSchema = z.object({
	successes: z.array(z.object({ expenseId: z.string() })),
	skips: z.array(
		z.object({ expenseId: z.string(), code: z.string(), reason: z.string() }),
	),
});

// Categories

export const categoryRuleSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	pattern: z.string(),
	category: z.string(),
	priority: z.number(),
});

export const categorySuggestionSchema = z.union([
	z.object({
		category: z.string(),
		source: z.literal("rule"),
		ruleId: z.string(),
		pattern: z.string(),
	}),
	z.object({
		category: z.string(),
		source: z.literal("default"),
		ruleId: z.null(),
		pattern: z.string(),
	}),
	z.object({
		category: z.string(),
		source: z.literal("fallback"),
		ruleId: z.null(),
		pattern: z.null(),
	}),
]);

export const categoryBackfillResultSchema = z.object({
	changes: z.array(
		z.object({
			expenseId: z.string(),
			description: z.string(),
			date: timestampSchema,
			amountMinor: z.number(),
			currency: z.string(),
			currentCategory: z.string().nullable(),
			category: z.string(),
			source: z.enum(["rule", "default", "fallback"]),
			pattern: z.string().nullable(),
		}),
	),
});

// Balances, settlements and payments

export const balanceMemberSchema = z.object({
	userId: z.string(),
	name: z.string(),
	image: z.string().nullable().optional(),
});

export const groupBalancesSchema = z.object({
	members: z.array(balanceMemberSchema.extend(groupBalanceSchema.shape)),
	/** The fewest payments that settle everyone, per currency. */
	transfers: z.array(
		z.object({
			from: balanceMemberSchema,
			to: balanceMemberSchema,
			amountMinor: z.number(),
			currency: z.string(),
		}),
	),
});

export const crossGroupBalanceSchema = z.object({
	counterpartyUserId: z.string(),
	counterpartyName: z.string(),
	currency: z.string(),
	amountMinor: z.number(),
	groups: z.array(
		z.object({
			groupId: z.string(),
			groupName: z.string(),
			amountMinor: z.number(),
		}),
	),
});

export const paymentIntentsResultSchema = z.object({
	intents: z.array(
		z.object({
			fromUserId: z.string(),
			fromName: z.string(),
			toUserId: z.string(),
			toName: z.string(),
			amountMinor: z.number(),
			currency: z.string(),
			upiUrl: z.string().nullable(),
		}),
	),
});

export const settlementRecordSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	fromUserId: z.string(),
	toUserId: z.string(),
	amountMinor: z.number(),
	currency: z.string(),
	note: z.string().nullable(),
	createdByUserId: z.string(),
	createdAt: timestampSchema,
	allocations: z.array(allocationSchema),
});

export const settlementDetailSchema = settlementRecordSchema.extend({
	from: userRecordSchema,
	to: userRecordSchema,
});

export const settlementPageResultSchema = z.object({
	items: z.array(
		settlementRecordSchema.omit({ allocations: true }).extend({
			from: z.object({ id: z.string(), name: z.string() }),
			to: z.object({ id: z.string(), name: z.string() }),
		}),
	),
	nextCursor: z.string().nullable(),
});

// Activity

const activityRecordSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	actorUserId: z.string(),
	actorName: z.string(),
	type: activityTypeSchema,
	targetType: z.string(),
	targetId: z.string(),
	/** Per-type details, already parsed from JSON. */
	metadata: z.record(z.string(), z.unknown()),
	createdAt: timestampSchema,
});

export const groupActivityPageSchema = z.object({
	items: z.array(activityRecordSchema),
	nextCursor: z.string().nullable(),
});

export const myActivityPageSchema = z.object({
	items: z.array(
		activityRecordSchema.extend({
			groupName: z.string(),
			deltaMinor: z.number().nullable(),
			/** Still in the group, so it's somewhere they can go. */
			isMember: z.boolean(),
			/** Set only while the expense this is about still exists. */
			expenseId: z.string().nullable(),
		}),
	),
	/** User id to display name, for ids that appear in `metadata`. */
	names: z.record(z.string(), z.string()),
	nextCursor: z.string().nullable(),
});

// Automation

export const reminderJobSchema = z.object({
	id: z.string(),
	kind: z.string(),
	dueAt: timestampSchema,
	payload: z.string(),
	attempts: z.number(),
	lockedAt: timestampSchema.nullable(),
	lockToken: z.string().nullable(),
	completedAt: timestampSchema.nullable(),
	lastError: z.string().nullable(),
	dedupeKey: z.string().nullable(),
});

export const reminderPreferencesResultSchema = z.object({
	emailReminders: z.boolean(),
});

export const recurringExpenseRecordSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	createdByUserId: z.string(),
	recurrence: z.enum(["daily", "weekly", "monthly", "yearly"]),
	nextRunAt: timestampSchema,
	/** The expense to create, as JSON. */
	payload: z.string(),
	active: z.boolean(),
});

// Apple Shortcut presets

/** Display name to id, the shape Shortcuts' "Choose from Menu" wants. */
export const shortcutMenuSchema = z.record(z.string(), z.string());
export const quickExpenseResultSchema = z.object({
	expenseId: z.string(),
	groupId: z.string(),
	message: z.string(),
});

// App pages: one request per screen, cookie or full-access key only

export const dashboardSchema = z.object({
	groups: z.array(groupSummarySchema),
	invitations: z.array(invitationDetailSchema),
	crossGroupBalances: z.array(crossGroupBalanceSchema),
	user: viewerSchema,
});

export const composerSchema = z.object({
	groups: z.array(composerGroupSchema),
	user: viewerSchema,
});

export const groupDirectorySchema = z.object({
	groups: z.array(groupDirectoryEntrySchema),
});

export const groupContextSchema = z.object({
	group: groupDetailSchema,
	user: viewerSchema,
});

export const groupFinancialSummarySchema = z.object({
	balances: groupBalancesSchema,
	paymentIntents: paymentIntentsResultSchema,
});

export const groupSettingsSchema = z.object({
	reminders: z.array(reminderJobSchema),
	categoryRules: z.array(categoryRuleSchema),
});

export const groupPageSchema = z.object({
	group: groupDetailSchema,
	expenses: expenseListSchema,
	balances: groupBalancesSchema,
	settlements: z.array(settlementDetailSchema),
	activities: groupActivityPageSchema,
	paymentIntents: paymentIntentsResultSchema,
	recurringExpenses: z.array(recurringExpenseRecordSchema),
	reminders: z.array(reminderJobSchema),
	categoryRules: z.array(categoryRuleSchema),
	invitations: z.array(invitationRecordSchema),
	user: viewerSchema,
});

// Session and site

export const sessionSchema = z
	.object({
		user: z.object({
			id: z.string(),
			name: z.string(),
			email: z.string(),
			emailVerified: z.boolean(),
			phone: z.string().nullable(),
			image: z.string().nullable().optional(),
			upiVpa: z.string().nullable().optional(),
			wiseTag: z.string().nullable().optional(),
			bio: z.string().nullable().optional(),
			isEmailPublic: z.boolean().nullable().optional(),
			isPhonePublic: z.boolean().nullable().optional(),
			isGuest: z.boolean().nullable().optional(),
			claimedAt: timestampSchema.nullable().optional(),
			emailReminders: z.boolean().nullable().optional(),
			createdAt: timestampSchema,
			updatedAt: timestampSchema,
		}),
		session: z.object({
			id: z.string(),
			userId: z.string(),
			token: z.string(),
			expiresAt: timestampSchema,
			ipAddress: z.string().nullable().optional(),
			userAgent: z.string().nullable().optional(),
			activeOrganizationId: z.string().nullable().optional(),
			createdAt: timestampSchema,
			updatedAt: timestampSchema,
		}),
	})
	.nullable();

export const siteInfoSchema = z.object({
	/** Direct hosted push today; a future relay can extend `via`. */
	push: z.object({ available: z.boolean(), via: z.enum(["direct", "none"]) }),
	origin: z.string(),
	supportEmail: z.string().nullable(),
	googleSignIn: z.boolean(),
	appleSignIn: z.boolean(),
	statusPageUrl: z.string().nullable(),
	/**
	 * What this server supports for the native app. Servers from before the
	 * app don't send it, so clients read it defensively.
	 */
	nativeAppVersion: z.number().int(),
});

export const legalInfoSchema = z.object({
	/** Null on an instance whose operator hasn't named themselves. */
	operator: z.string().nullable(),
	governingLaw: z.string().nullable(),
	/** Null when the operator hasn't published a privacy and legal address. */
	contactEmail: z.string().nullable(),
	/** Where the database lives, e.g. "India"; null when the operator hasn't said. */
	dataLocation: z.string().nullable(),
	origin: z.string(),
	processors: z.array(
		z.object({
			name: z.string(),
			purpose: z.string(),
			privacyUrl: z.string(),
			/** Where it processes data; null for global services like Google sign-in. */
			location: z.string().nullable(),
		}),
	),
});

export const pendingVerificationSchema = z
	.object({ email: z.string() })
	.nullable();
export const verificationSendSchema = z.object({
	sent: z.boolean(),
	retryAt: z.string(),
});
export const healthSchema = z.object({ status: z.literal("ok") });

const reportTotalsSchema = z.array(
	z.object({
		currency: z.string(),
		category: z.string(),
		amountMinor: z.number(),
		count: z.number(),
	}),
);

/**
 * What the report handler builds. Over HTTP the server sends `content` as the
 * file itself (CSV or PDF) with a `Content-Disposition` filename, so clients
 * receive a file rather than this object.
 */
export const expenseReportFileSchema = z.union([
	z.object({
		contentType: z.string(),
		encoding: z.literal("utf8"),
		content: z.string(),
		filename: z.string(),
		count: z.number(),
		totals: reportTotalsSchema,
	}),
	z.object({
		contentType: z.string(),
		encoding: z.literal("base64"),
		content: z.string(),
		filename: z.string(),
		count: z.number(),
		totals: reportTotalsSchema,
	}),
]);
