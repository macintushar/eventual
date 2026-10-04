/**
 * Reader-facing copy for the generated OpenAPI document: the introduction,
 * one summary per operation, and the tag names and groups that order the
 * reference at /api/docs. Contracts stay in the operation registry; this file
 * only says what each one is for.
 */

export const API_INTRODUCTION = `
Everything you can do in Eventual (groups, expenses, balances and settling up) is available over HTTP. The app, the iOS Shortcut and the MCP server all use this API.

## Quick start

1. Create a key under **Settings → API keys**. It's only shown once.
2. Send it in an \`x-api-key\` header on every request.
3. Start with your groups, then read or add expenses in one.

\`\`\`bash
curl https://eventual.macintushar.xyz/api/v1/groups \\
  -H "x-api-key: ev_your_api_key"
\`\`\`

## Authentication

Requests accept any one of these:

| Method | Header | Use it for |
| --- | --- | --- |
| API key | \`x-api-key: ev_…\` | Scripts, shortcuts and integrations |
| Bearer token | \`Authorization: Bearer ev_…\` | Clients that only support bearer auth |
| Session cookie | \`better-auth.session_token\` | The web app, same origin only |

Give each device or integration its own key so you can revoke them separately. A key acts as you, with the same access you have in each group.

## Money

Amounts are integers in the currency's **minor unit**, so \`amountMinor: 120050\` in \`INR\` is ₹1,200.50. Every amount comes with an ISO 4217 \`currency\` code. Balances are reported per currency and never converted.

## Errors

Failed requests return a JSON body with a stable \`code\` you can branch on, plus a human-readable \`message\`:

\`\`\`json
{ "error": { "code": "NOT_FOUND", "message": "Group not found" } }
\`\`\`

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | \`UNAUTHENTICATED\` | Missing, expired or revoked credentials |
| 403 | \`FORBIDDEN\` | Signed in, but your role doesn't allow this |
| 404 | \`NOT_FOUND\` | It doesn't exist, or you can't see it |
| 409 | \`EXPENSE_LOCKED\` | A share is marked paid; unmark it before editing |
| 409 | \`CONFLICT\` | The request clashes with the current state |
| 422 | \`VALIDATION\` | The body or query failed validation; see \`details\` |
| 500 | \`INTERNAL\` | Something broke on our side |

## Pagination

The \`/v2\` list endpoints are cursor-paginated. Pass \`limit\` (1–100, default 30), then send the returned \`nextCursor\` back with the same filters to get the next page. A missing \`nextCursor\` means you've reached the end.
`.trim();

/** Display order of the reference, one heading per group of tags. */
export const TAG_GROUPS = [
	{ name: "Groups & people", tags: ["group", "member", "invitation"] },
	{
		name: "Expenses",
		tags: ["expense", "share", "category", "recurring"],
	},
	{
		name: "Balances & settling up",
		tags: ["balance", "settlement", "payment", "reminder"],
	},
	{ name: "You", tags: ["activity", "profile", "apiKey"] },
	{ name: "Integrations", tags: ["preset"] },
	{
		name: "App internals",
		tags: ["app", "session", "verification", "site", "legal", "health"],
	},
] as const;

export const TAGS: Record<
	string,
	{ displayName: string; description: string }
> = {
	group: {
		displayName: "Groups",
		description:
			"A group is a shared ledger: a trip, a flat, a dinner club. Everything else lives inside one.",
	},
	member: {
		displayName: "Members",
		description:
			"People in a group, their role, and their weight for weighted splits. Guests are members without an account.",
	},
	invitation: {
		displayName: "Invitations",
		description:
			"Invite someone to a group by email, and accept or revoke invitations.",
	},
	expense: {
		displayName: "Expenses",
		description:
			"Log, search, preview and edit expenses. Each expense records who paid and how the cost is split.",
	},
	share: {
		displayName: "Shares",
		description:
			"One person's part of an expense. While any share is marked paid, the expense is locked against edits.",
	},
	category: {
		displayName: "Categories",
		description:
			"Rules that file expenses into categories automatically, plus suggestions for new ones.",
	},
	recurring: {
		displayName: "Recurring expenses",
		description:
			"Templates that log the same expense on a schedule, like rent or a subscription.",
	},
	balance: {
		displayName: "Balances",
		description:
			"Who owes whom, per currency, with transfers simplified to the fewest payments.",
	},
	settlement: {
		displayName: "Settlements",
		description: "Record a repayment between two people in a group.",
	},
	payment: {
		displayName: "UPI payments",
		description:
			"A UPI payment intent for each INR transfer that would settle the group. Pay in your UPI app, then record a settlement.",
	},
	reminder: {
		displayName: "Reminders",
		description:
			"Nudge people who owe money, and choose which reminders you receive.",
	},
	activity: {
		displayName: "Activity",
		description:
			"A timeline of what changed, in one group or across all of yours.",
	},
	profile: {
		displayName: "Profile",
		description: "Your name and account details.",
	},
	apiKey: {
		displayName: "API keys",
		description:
			"Create and revoke the keys that authenticate this API. A new key's secret is returned once.",
	},
	preset: {
		displayName: "Shortcut presets",
		description:
			"Compact endpoints shaped for Apple Shortcuts: lists come back as `{ label: id }` dictionaries.",
	},
	app: {
		displayName: "App screens",
		description:
			"Page payloads for the Eventual web and mobile apps. Shaped for one screen each and may change without notice; build integrations on the endpoints above.",
	},
	session: {
		displayName: "Session",
		description: "The signed-in user, if any. Used by the apps.",
	},
	verification: {
		displayName: "Email verification",
		description: "Resend the verification email for a pending sign-up.",
	},
	site: {
		displayName: "Site",
		description:
			"Public site configuration: origin, support email and enabled sign-in methods.",
	},
	legal: {
		displayName: "Legal",
		description:
			"Who operates this instance, where data lives, and which processors handle it.",
	},
	health: {
		displayName: "Health",
		description: 'Liveness check. Returns `{ status: "ok" }`.',
	},
};

export const SUMMARIES: Record<string, string> = {
	"group.list": "List your groups",
	"group.create": "Create a group",
	"group.get": "Get a group",
	"group.rename": "Rename a group",
	"group.delete": "Delete a group",
	"group.leave": "Leave a group",
	"group.archive": "Archive a group",
	"group.unarchive": "Unarchive a group",
	"group.duplicate": "Duplicate a group",
	"member.list": "List members",
	"member.add": "Add a member",
	"member.role": "Change a member's role",
	"member.remove": "Remove a member",
	"member.weight": "Set a member's split weight",
	"member.merge": "Merge a guest into a member",
	"invitation.mine": "List your invitations",
	"invitation.list": "List a group's invitations",
	"invitation.create": "Invite someone",
	"invitation.get": "Get an invitation",
	"invitation.revoke": "Revoke an invitation",
	"invitation.accept": "Accept an invitation",
	"expense.page": "Page through expenses",
	"expense.list": "List expenses",
	"expense.create": "Create an expense",
	"expense.get": "Get an expense",
	"expense.update": "Update an expense",
	"expense.delete": "Delete an expense",
	"expense.preview": "Preview a split",
	"expense.resplit": "Re-split expenses in bulk",
	"expense.report": "Export an expense report",
	"share.paid": "Mark a share paid",
	"share.unpaid": "Mark a share unpaid",
	"category.list": "List category rules",
	"category.create": "Create a category rule",
	"category.suggest": "Suggest a category",
	"category.update": "Update a category rule",
	"category.delete": "Delete a category rule",
	"balance.get": "Get group balances",
	"balance.crossGroup": "Get your balances across groups",
	"payment.intents": "List UPI payment intents",
	"settlement.page": "Page through settlements",
	"settlement.list": "List settlements",
	"settlement.create": "Record a settlement",
	"settlement.delete": "Delete a settlement",
	"activity.group": "List group activity",
	"activity.mine": "List your activity",
	"reminder.list": "List reminders",
	"reminder.schedule": "Schedule a reminder",
	"reminder.preferences.get": "Get reminder preferences",
	"reminder.preferences.update": "Update reminder preferences",
	"recurring.list": "List recurring expenses",
	"recurring.create": "Create a recurring expense",
	"recurring.update": "Update a recurring expense",
	"recurring.delete": "Delete a recurring expense",
	"preset.shortcut.groups": "Groups for a shortcut",
	"preset.shortcut.members": "Members for a shortcut",
	"preset.shortcut.expense": "Log an expense from a shortcut",
	health: "Check health",
	"site.get": "Get site configuration",
	"legal.get": "Get legal information",
	"session.get": "Get the current session",
	"verification.pending": "Get pending verification",
	"verification.send": "Resend verification email",
	"app.dashboard": "Dashboard",
	"app.composer": "Expense composer",
	"app.groupDirectory": "Group directory",
	"app.groupContext": "Group context",
	"app.groupSummary": "Group financial summary",
	"app.groupSettings": "Group settings",
	"app.groupPage": "Group page",
	"profile.update": "Update your profile",
	"apiKey.list": "List API keys",
	"apiKey.create": "Create an API key",
	"apiKey.delete": "Revoke an API key",
};
