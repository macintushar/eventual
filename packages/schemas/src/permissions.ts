import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * One permission vocabulary for the whole app. The same statements drive:
 *
 * - group roles (owner / admin / member) via the organization plugin,
 * - service-layer checks through `requirePermission`,
 * - API key scopes, verified against the key's stored permissions.
 *
 * The shape is `{ resource: actions[] }` — `{ expense: ["create"] }` reads as
 * "may create expenses". Better Auth's defaults cover organization, member,
 * invitation, team and ac; the resources below are ours. `member` and
 * `invitation` are re-declared to add the actions the defaults lack.
 */
export const statement = {
	...defaultStatements,
	member: ["create", "update", "delete", "read", "role"],
	invitation: ["create", "cancel", "read", "accept"],
	group: ["read", "create", "update", "delete"],
	expense: ["read", "create", "update", "delete"],
	settlement: ["read", "create", "delete"],
	balance: ["read"],
	activity: ["read"],
	reminder: ["read", "create", "update"],
	category: ["read", "create", "update", "delete"],
	/**
	 * Key-only: act as the owner on account-level surfaces (profile, the app's
	 * own pages, Better Auth's group endpoints). No group role grants it.
	 */
	account: ["impersonate"],
} as const;

export const ac = createAccessControl(statement);

export type PermissionResource = keyof typeof statement;
export type Permissions = { [K in PermissionResource]?: string[] };

export const owner = ac.newRole({
	...ownerAc.statements,
	member: ["create", "update", "delete", "read", "role"],
	invitation: ["create", "cancel", "read", "accept"],
	group: ["read", "create", "update", "delete"],
	expense: ["read", "create", "update", "delete"],
	settlement: ["read", "create", "delete"],
	balance: ["read"],
	activity: ["read"],
	reminder: ["read", "create", "update"],
	category: ["read", "create", "update", "delete"],
});

/** Everything except deleting the group and changing roles. */
export const admin = ac.newRole({
	...adminAc.statements,
	member: ["create", "update", "delete", "read"],
	invitation: ["create", "cancel", "read"],
	group: ["read", "create", "update"],
	expense: ["read", "create", "update", "delete"],
	settlement: ["read", "create", "delete"],
	balance: ["read"],
	activity: ["read"],
	reminder: ["read", "create", "update"],
	category: ["read", "create", "update", "delete"],
});

/** Day-to-day spending: full expense and settlement access, nothing structural. */
export const member = ac.newRole({
	...memberAc.statements,
	member: ["read"],
	invitation: [],
	group: ["read", "create"],
	expense: ["read", "create", "update", "delete"],
	settlement: ["read", "create", "delete"],
	balance: ["read"],
	activity: ["read"],
	reminder: ["read", "create", "update"],
	category: ["read"],
});

export const roles = { owner, admin, member } as const;
export type GroupRole = keyof typeof roles;

/**
 * Does this group role allow every listed action? Unknown roles deny — the
 * database should only ever hold owner/admin/member, but a stale or forged
 * value must fail closed rather than open.
 */
export function roleCan(role: string, permissions: Permissions) {
	const granted = roles[role as GroupRole];
	if (!granted) return false;
	return granted.authorize(permissions as never).success;
}

/** Single-action shorthand for UI gates: `can(role, "member", "create")`. */
export function can<R extends PermissionResource>(
	role: string,
	resource: R,
	action: (typeof statement)[R][number],
) {
	return roleCan(role, { [resource]: [action] });
}

/**
 * Recurring expenses belong to whoever set them up; beyond that, anyone who
 * can manage the group (owners and admins) can pause or delete them.
 */
export function canEditRecurring(role: string, isCreator: boolean) {
	return isCreator || can(role, "group", "update");
}

const roleOrder: GroupRole[] = ["owner", "admin", "member"];

/**
 * Who in a group may do this, in words — derived from the roles above so UI
 * copy can't drift from what the server enforces.
 */
export function whoCan(permissions: Permissions) {
	const allowed = roleOrder.filter((role) => roleCan(role, permissions));
	if (allowed.length === roleOrder.length) return "Everyone";
	if (allowed.length === 0) return "No one";
	if (allowed.length === 1 && allowed[0] === "owner") return "Only the owner";
	const plural = allowed.map((role) => `${role}s`);
	return `Only ${plural.slice(0, -1).join(", ")}${plural.length > 1 ? " and " : ""}${plural.at(-1)}`;
}

/* ------------------------------------------------------------- API keys */

/**
 * What an API key may do, chosen at creation. Legacy keys predate scopes and
 * have no stored permissions; they keep full access so existing integrations
 * don't break.
 */
export const transactionalKeyPermissions = {
	group: ["read"],
	member: ["read"],
	expense: ["read", "create", "update"],
	settlement: ["read", "create"],
	balance: ["read"],
	activity: ["read"],
	category: ["read"],
	reminder: ["read", "create", "update"],
} satisfies Permissions;

export const managementKeyPermissions = {
	group: ["read", "create", "update", "delete"],
	member: ["read", "create", "update", "delete", "role"],
	invitation: ["read", "create", "cancel", "accept"],
	expense: ["read", "create", "update", "delete"],
	settlement: ["read", "create", "delete"],
	balance: ["read"],
	activity: ["read"],
	reminder: ["read", "create", "update"],
	category: ["read", "create", "update", "delete"],
} satisfies Permissions;

/**
 * Everything management can do, plus standing in for the owner on account
 * surfaces. Never credentials: passwords, email, sessions, account deletion
 * and API keys stay cookie-only for every key. Opt-in, and always expires.
 */
export const fullAccessKeyPermissions = {
	...managementKeyPermissions,
	account: ["impersonate"],
} satisfies Permissions;

/** Full-access keys must expire within this many days. */
export const FULL_ACCESS_MAX_DAYS = 90;

export const keyPresets = {
	transactional: transactionalKeyPermissions,
	management: managementKeyPermissions,
	full: fullAccessKeyPermissions,
} as const;

export type KeyPresetMode = keyof typeof keyPresets;
export type ApiKeyMode = KeyPresetMode | "custom" | "legacy";

/** May this key act as its owner on account-level surfaces? */
export function canImpersonate(permissions: Permissions | null) {
	return Boolean(permissions?.account?.includes("impersonate"));
}

function normalize(permissions: Permissions) {
	return Object.entries(permissions)
		.filter(([, actions]) => actions?.length)
		.map(([resource, actions]) => `${resource}:${[...(actions ?? [])].sort()}`)
		.sort()
		.join(";");
}

function samePermissions(a: Permissions, b: Permissions) {
	return normalize(a) === normalize(b);
}

/** Label a stored permission set for display, matching presets where possible. */
export function apiKeyMode(permissions: Permissions | null): ApiKeyMode {
	if (!permissions) return "legacy";
	if (samePermissions(permissions, transactionalKeyPermissions))
		return "transactional";
	if (samePermissions(permissions, managementKeyPermissions))
		return "management";
	if (samePermissions(permissions, fullAccessKeyPermissions)) return "full";
	return "custom";
}

/**
 * A custom scope is only valid if every action exists in the statement and
 * its resource is one the picker offers — so `account` (full access) can only
 * come from the explicit preset, never a hand-built permission set.
 */
export function validateKeyPermissions(permissions: Permissions) {
	const entries = Object.entries(permissions).filter(
		([, actions]) => actions.length > 0,
	);
	if (!entries.length) return false;
	return entries.every(
		([resource, actions]) =>
			keyScopeResources.some((row) => row.resource === resource) &&
			actions.every((action) =>
				(
					statement[resource as PermissionResource] as readonly string[]
				).includes(action),
			),
	);
}

/**
 * Rows for the custom-scope picker, in the order people think about them:
 * money first, structure last. Actions come straight from the statement so the
 * UI can never offer a permission the server would reject.
 */
export const keyScopeResources: {
	resource: PermissionResource;
	label: string;
	description: string;
}[] = [
	{
		resource: "expense",
		label: "Expenses",
		description: "Record, edit and delete expenses, including recurring ones",
	},
	{
		resource: "settlement",
		label: "Settlements",
		description: "Record and undo payments between members",
	},
	{
		resource: "balance",
		label: "Balances",
		description: "Read who owes what and payment links",
	},
	{
		resource: "activity",
		label: "Activity",
		description: "Read the group's history feed",
	},
	{
		resource: "reminder",
		label: "Reminders",
		description: "Schedule balance reminder emails",
	},
	{
		resource: "category",
		label: "Category rules",
		description: "Manage automatic expense categorization",
	},
	{
		resource: "group",
		label: "Groups",
		description: "Create, rename, archive and delete groups",
	},
	{
		resource: "member",
		label: "Members",
		description: "Add, edit and remove members and their roles",
	},
	{
		resource: "invitation",
		label: "Invitations",
		description: "Send and revoke invite links",
	},
];
