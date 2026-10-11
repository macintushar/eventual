import { formatMinor } from "@eventual/schemas/money";
import type { EndpointOutput } from "@eventual/sdk";

export type GroupActivity = EndpointOutput<"activity.group">["items"][number];
export type PersonalActivity = EndpointOutput<"activity.mine">["items"][number];
export type ActivityType = GroupActivity["type"];

/** A sentence as runs of text; `bold` marks names and titles. */
export type Run = { text: string; bold?: boolean };
export type Outcome = {
	text: string;
	tone: "positive" | "negative" | "muted";
	/** A deleted expense or payment no longer counts. */
	struck?: boolean;
};

const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" ? value : 0);
const b = (text: string): Run => ({ text, bold: true });
const t = (text: string): Run => ({ text });
const q = (text: string): Run[] => [t("“"), b(text), t("”")];
const money = (
	meta: Record<string, unknown>,
	key = "amountMinor",
	currencyKey = "currency",
) => formatMinor(num(meta[key]), str(meta[currencyKey]) || "INR");

/** The web's `activity-line.tsx`, for a group's own feed. */
export function groupSentence(
	item: GroupActivity,
	nameOf: (userId: string) => string,
): Run[] {
	const meta = item.metadata ?? {};
	const actor = b(item.actorName);
	switch (item.type) {
		case "group.created":
			return [actor, t(" created "), b(str(meta.name))];
		case "group.renamed":
			return [
				actor,
				t(" renamed the group from "),
				b(str(meta.from)),
				t(" to "),
				b(str(meta.to)),
			];
		case "group.archived":
			return [actor, t(" archived the group")];
		case "group.unarchived":
			return [actor, t(" restored the group")];
		case "group.duplicated":
			return [actor, t(" duplicated the group")];
		case "group.deleted":
			return [actor, t(" deleted the group")];
		case "member.invited":
			return [
				actor,
				t(" invited "),
				b(str(meta.email)),
				t(` as ${str(meta.role) || "member"}`),
			];
		case "member.invite_revoked":
			return [actor, t(" revoked the invitation for "), b(str(meta.email))];
		case "member.joined":
			// Adding a guest is logged as the adder "joining"; say what happened.
			if (meta.isGuest === true && str(meta.userId))
				return [
					actor,
					t(" added "),
					b(nameOf(str(meta.userId))),
					t(" as a guest"),
				];
			return str(meta.replacedGuestName)
				? [
						actor,
						t(" joined and took over "),
						b(str(meta.replacedGuestName)),
						t("’s expenses"),
					]
				: [actor, t(" joined the group")];
		case "member.removed":
			return [actor, t(" removed "), b(nameOf(str(meta.userId)))];
		case "member.left":
			return [actor, t(" left the group")];
		case "member.role_changed":
			return [
				actor,
				t(" changed "),
				b(nameOf(str(meta.userId))),
				t(` from ${str(meta.from)} to ${str(meta.to)}`),
			];
		case "member.updated":
			return [
				actor,
				t(" updated "),
				b(nameOf(str(meta.userId))),
				t(
					`’s ${Array.isArray(meta.fields) && meta.fields.length ? meta.fields.join(" and ") : "details"}`,
				),
			];
		case "expense.created":
			return [
				actor,
				t(" added "),
				b(str(meta.description)),
				t(` for ${money(meta)}`),
			];
		case "expense.updated":
			return num(meta.fromAmountMinor) !== num(meta.amountMinor) ||
				meta.fromCurrency !== meta.currency
				? [
						actor,
						t(" changed "),
						b(str(meta.description)),
						t(
							` from ${money(meta, "fromAmountMinor", "fromCurrency")} to ${money(meta)}`,
						),
					]
				: [actor, t(" edited "), b(str(meta.description))];
		case "expense.deleted":
			return [
				actor,
				t(" deleted "),
				b(str(meta.description)),
				t(` (${money(meta)})`),
			];
		case "share.marked_paid":
			return [
				actor,
				t(" marked "),
				b(nameOf(str(meta.userId))),
				t("’s share paid"),
			];
		case "share.marked_unpaid":
			return [
				actor,
				t(" marked "),
				b(nameOf(str(meta.userId))),
				t("’s share unpaid"),
			];
		case "settlement.created":
			return [
				actor,
				t(" recorded a payment to "),
				b(nameOf(str(meta.toUserId))),
				t(` of ${money(meta)}`),
			];
		case "settlement.deleted":
			return [actor, t(` deleted a payment of ${money(meta)}`)];
		default:
			return [actor, t(" changed the group")];
	}
}

const article: Record<string, string> = {
	owner: "an owner",
	admin: "an admin",
	member: "a member",
};

/**
 * The web's `personal-activity.tsx`: the same event reads differently
 * depending on who's looking, so the viewer's own actions say "You".
 */
export function personalSentence(
	item: PersonalActivity,
	viewerId: string,
	names: Record<string, string>,
): Run[] {
	const meta = item.metadata ?? {};
	const actor = b(item.actorUserId === viewerId ? "You" : item.actorName);
	const person = (userId: string) =>
		userId === viewerId ? "you" : (names[userId] ?? "someone");
	const group = q(item.groupName);
	const description = str(meta.description);
	switch (item.type) {
		case "expense.created":
			return [
				actor,
				t(" added "),
				...q(description),
				t(" in "),
				...group,
				t("."),
			];
		case "expense.updated":
			return [
				actor,
				t(" updated "),
				...q(description),
				t(" in "),
				...group,
				t("."),
			];
		case "expense.deleted":
			return [
				actor,
				t(" deleted "),
				...q(description),
				t(" from "),
				...group,
				t("."),
			];
		case "share.marked_paid":
		case "share.marked_unpaid": {
			const owner = str(meta.userId);
			const whose =
				owner === viewerId ? "your" : `${names[owner] ?? "someone"}’s`;
			return [
				actor,
				t(" marked "),
				b(whose),
				t(" share"),
				...(description ? [t(" of "), ...q(description)] : []),
				t(` as ${item.type === "share.marked_paid" ? "paid" : "unpaid"} in `),
				...group,
				t("."),
			];
		}
		case "settlement.created":
			return [
				actor,
				t(" paid "),
				b(person(str(meta.toUserId))),
				t(" in "),
				...group,
				t("."),
			];
		case "settlement.deleted":
			return meta.fromUserId
				? [
						actor,
						t(" deleted a payment from "),
						b(person(str(meta.fromUserId))),
						t(" to "),
						b(person(str(meta.toUserId))),
						t(" in "),
						...group,
						t("."),
					]
				: [actor, t(" deleted a payment in "), ...group, t(".")];
		case "member.invited":
			return [actor, t(" invited you to "), ...group, t(".")];
		case "member.joined":
			return [t("You joined "), ...group, t(".")];
		case "member.removed":
			return [actor, t(" removed you from "), ...group, t(".")];
		case "member.left":
			return [t("You left "), ...group, t(".")];
		case "member.role_changed":
			return [
				actor,
				t(` made you ${article[str(meta.to)] ?? "a member"} of `),
				...group,
				t("."),
			];
		default:
			return [actor, t(" changed "), ...group, t(".")];
	}
}

/** What it came to for the viewer, always in words as well as colour. */
export function personalOutcome(
	item: PersonalActivity,
	viewerId: string,
): Outcome | null {
	const meta = item.metadata ?? {};
	const currency = str(meta.currency) || "INR";
	const amount = (minor: number) => formatMinor(Math.abs(minor), currency);
	switch (item.type) {
		case "expense.created":
		case "expense.updated":
		case "expense.deleted": {
			const delta = item.deltaMinor;
			if (delta === null) return null;
			const struck = item.type === "expense.deleted" && delta !== 0;
			if (delta > 0)
				return {
					text: `You get back ${amount(delta)}`,
					tone: "positive",
					struck,
				};
			if (delta < 0)
				return { text: `You owe ${amount(delta)}`, tone: "negative", struck };
			return { text: "Nothing owed either way", tone: "muted" };
		}
		case "share.marked_paid":
		case "share.marked_unpaid": {
			if (typeof meta.amountMinor !== "number") return null;
			const mine = str(meta.userId) === viewerId;
			const value = amount(meta.amountMinor);
			if (item.type === "share.marked_paid")
				return {
					text: `${mine ? "You paid back" : "You got back"} ${value}`,
					tone: "positive",
				};
			return mine
				? { text: `You owe ${value} again`, tone: "negative" }
				: { text: `You get back ${value} again`, tone: "positive" };
		}
		case "settlement.created":
		case "settlement.deleted": {
			const value = amount(num(meta.amountMinor));
			const text = !meta.fromUserId
				? value
				: str(meta.fromUserId) === viewerId
					? `You paid ${value}`
					: `You received ${value}`;
			return item.type === "settlement.deleted"
				? { text, tone: "muted", struck: true }
				: { text, tone: "positive" };
		}
		default:
			return null;
	}
}

/** Ionicons for each event, matched to the web's Lucide set. */
export const activityIcon: Record<string, string> = {
	"group.created": "folder-open-outline",
	"group.renamed": "pencil-outline",
	"group.archived": "archive-outline",
	"group.unarchived": "arrow-undo-outline",
	"group.duplicated": "copy-outline",
	"group.deleted": "trash-outline",
	"member.invited": "mail-outline",
	"member.invite_revoked": "mail-unread-outline",
	"member.joined": "person-add-outline",
	"member.removed": "person-remove-outline",
	"member.left": "log-out-outline",
	"member.role_changed": "shield-outline",
	"member.updated": "create-outline",
	"expense.created": "receipt-outline",
	"expense.updated": "receipt-outline",
	"expense.deleted": "trash-outline",
	"share.marked_paid": "checkmark-circle-outline",
	"share.marked_unpaid": "remove-circle-outline",
	"settlement.created": "swap-horizontal-outline",
	"settlement.deleted": "trash-outline",
};

const units: [string, number][] = [
	["year", 31536000000],
	["month", 2592000000],
	["day", 86400000],
	["hour", 3600000],
	["minute", 60000],
];

/**
 * "3 hours ago", matching the web's `Intl.RelativeTimeFormat` output in
 * en-IN. Spelled out because Hermes doesn't ship RelativeTimeFormat.
 */
export function relativeTime(value: Date | string) {
	const elapsed = Date.now() - new Date(value).getTime();
	for (const [unit, ms] of units)
		if (Math.abs(elapsed) >= ms) {
			const count = Math.round(elapsed / ms);
			if (count === 1 && unit === "day") return "yesterday";
			if (count === 1 && unit !== "hour" && unit !== "minute")
				return `last ${unit}`;
			return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
		}
	return "just now";
}
