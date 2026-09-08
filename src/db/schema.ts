import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
	unique,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" })
		.default(false)
		.notNull(),
	image: text("image"),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.$onUpdate(() => new Date())
		.notNull(),
});

export const session = sqliteTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		activeOrganizationId: text("active_organization_id"),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: integer("access_token_expires_at", {
			mode: "timestamp_ms",
		}),
		refreshTokenExpiresAt: integer("refresh_token_expires_at", {
			mode: "timestamp_ms",
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = sqliteTable(
	"organization",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		logo: text("logo"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		metadata: text("metadata"),
	},
	(table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const member = sqliteTable(
	"member",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").default("member").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("member_organizationId_idx").on(table.organizationId),
		index("member_userId_idx").on(table.userId),
	],
);

export const invitation = sqliteTable(
	"invitation",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").default("pending").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		inviterId: text("inviter_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("invitation_organizationId_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	],
);

export const apikey = sqliteTable(
	"apikey",
	{
		id: text("id").primaryKey(),
		configId: text("config_id").default("default").notNull(),
		name: text("name"),
		start: text("start"),
		prefix: text("prefix"),
		key: text("key").notNull(),
		referenceId: text("reference_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		refillInterval: integer("refill_interval"),
		refillAmount: integer("refill_amount"),
		lastRefillAt: integer("last_refill_at", { mode: "timestamp_ms" }),
		enabled: integer("enabled", { mode: "boolean" }).default(true),
		rateLimitEnabled: integer("rate_limit_enabled", {
			mode: "boolean",
		}).default(true),
		rateLimitTimeWindow: integer("rate_limit_time_window"),
		rateLimitMax: integer("rate_limit_max"),
		requestCount: integer("request_count").default(0),
		remaining: integer("remaining"),
		lastRequest: integer("last_request", { mode: "timestamp_ms" }),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
		permissions: text("permissions"),
		metadata: text("metadata"),
	},
	(table) => [
		index("apikey_referenceId_idx").on(table.referenceId),
		index("apikey_configId_idx").on(table.configId),
		index("apikey_key_idx").on(table.key),
	],
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	members: many(member),
	invitations: many(invitation),
	apiKeys: many(apikey),
	expenseShares: many(expenseShare),
	activities: many(activity),
}));

export const apikeyRelations = relations(apikey, ({ one }) => ({
	user: one(user, {
		fields: [apikey.referenceId],
		references: [user.id],
	}),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation),
	expenses: many(expense),
	settlements: many(settlement),
	activities: many(activity),
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
}));

export const expense = sqliteTable(
	"expense",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		description: text("description").notNull(),
		notes: text("notes"),
		amountMinor: integer("amount_minor").notNull(),
		currency: text("currency").default("INR").notNull(),
		paidByUserId: text("paid_by_user_id")
			.notNull()
			.references(() => user.id),
		splitMethod: text("split_method", {
			enum: ["even", "exact", "shares", "percent"],
		}).notNull(),
		date: integer("date", { mode: "timestamp" }).notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("expense_organization_id_idx").on(table.organizationId),
		check("expense_amount_positive", sql`${table.amountMinor} > 0`),
	],
);

export const expenseShare = sqliteTable(
	"expense_share",
	{
		id: text("id").primaryKey(),
		expenseId: text("expense_id")
			.notNull()
			.references(() => expense.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		amountMinor: integer("amount_minor").notNull(),
		splitInput: integer("split_input"),
		paidAt: integer("paid_at", { mode: "timestamp" }),
		paidMarkedByUserId: text("paid_marked_by_user_id").references(
			() => user.id,
		),
	},
	(table) => [
		index("expense_share_expense_id_idx").on(table.expenseId),
		index("expense_share_user_id_idx").on(table.userId),
		unique("expense_share_expense_user_unique").on(
			table.expenseId,
			table.userId,
		),
		check("expense_share_amount_nonnegative", sql`${table.amountMinor} >= 0`),
	],
);

export const settlement = sqliteTable(
	"settlement",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		fromUserId: text("from_user_id")
			.notNull()
			.references(() => user.id),
		toUserId: text("to_user_id")
			.notNull()
			.references(() => user.id),
		amountMinor: integer("amount_minor").notNull(),
		currency: text("currency").default("INR").notNull(),
		note: text("note"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("settlement_organization_id_idx").on(table.organizationId),
		check("settlement_amount_positive", sql`${table.amountMinor} > 0`),
	],
);

export const settlementAllocation = sqliteTable(
	"settlement_allocation",
	{
		id: text("id").primaryKey(),
		settlementId: text("settlement_id")
			.notNull()
			.references(() => settlement.id, { onDelete: "cascade" }),
		expenseShareId: text("expense_share_id")
			.notNull()
			.references(() => expenseShare.id, { onDelete: "cascade" }),
		amountMinor: integer("amount_minor").notNull(),
	},
	(table) => [
		index("settlement_allocation_settlement_id_idx").on(table.settlementId),
		index("settlement_allocation_share_id_idx").on(table.expenseShareId),
	],
);

export const activityTypes = [
	"group.created",
	"group.renamed",
	"group.deleted",
	"member.invited",
	"member.invite_revoked",
	"member.joined",
	"member.removed",
	"member.left",
	"member.role_changed",
	"expense.created",
	"expense.updated",
	"expense.deleted",
	"share.marked_paid",
	"share.marked_unpaid",
	"settlement.created",
	"settlement.deleted",
] as const;

export const activity = sqliteTable(
	"activity",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		type: text("type", { enum: activityTypes }).notNull(),
		targetType: text("target_type").notNull(),
		targetId: text("target_id").notNull(),
		metadata: text("metadata").default("{}").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("activity_organization_id_idx").on(table.organizationId),
		index("activity_created_at_idx").on(table.createdAt),
	],
);

export const expenseRelations = relations(expense, ({ one, many }) => ({
	organization: one(organization, {
		fields: [expense.organizationId],
		references: [organization.id],
	}),
	payer: one(user, {
		fields: [expense.paidByUserId],
		references: [user.id],
		relationName: "expensePayer",
	}),
	creator: one(user, {
		fields: [expense.createdByUserId],
		references: [user.id],
		relationName: "expenseCreator",
	}),
	shares: many(expenseShare),
}));

export const expenseShareRelations = relations(
	expenseShare,
	({ one, many }) => ({
		expense: one(expense, {
			fields: [expenseShare.expenseId],
			references: [expense.id],
		}),
		user: one(user, {
			fields: [expenseShare.userId],
			references: [user.id],
			relationName: "shareOwner",
		}),
		paidMarkedBy: one(user, {
			fields: [expenseShare.paidMarkedByUserId],
			references: [user.id],
			relationName: "sharePaidMarker",
		}),
		allocations: many(settlementAllocation),
	}),
);

export const settlementRelations = relations(settlement, ({ one, many }) => ({
	organization: one(organization, {
		fields: [settlement.organizationId],
		references: [organization.id],
	}),
	from: one(user, {
		fields: [settlement.fromUserId],
		references: [user.id],
		relationName: "settlementFrom",
	}),
	to: one(user, {
		fields: [settlement.toUserId],
		references: [user.id],
		relationName: "settlementTo",
	}),
	creator: one(user, {
		fields: [settlement.createdByUserId],
		references: [user.id],
		relationName: "settlementCreator",
	}),
	allocations: many(settlementAllocation),
}));

export const settlementAllocationRelations = relations(
	settlementAllocation,
	({ one }) => ({
		settlement: one(settlement, {
			fields: [settlementAllocation.settlementId],
			references: [settlement.id],
		}),
		expenseShare: one(expenseShare, {
			fields: [settlementAllocation.expenseShareId],
			references: [expenseShare.id],
		}),
	}),
);

export const activityRelations = relations(activity, ({ one }) => ({
	organization: one(organization, {
		fields: [activity.organizationId],
		references: [organization.id],
	}),
	actor: one(user, { fields: [activity.actorUserId], references: [user.id] }),
}));
