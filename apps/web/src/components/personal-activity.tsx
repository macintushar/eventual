import { Link } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import type { ReactNode } from "react";

import { type ActivityType, activityIcons } from "#/components/activity-line";
import { Amount } from "#/components/amount";
import { MemberAvatar } from "#/components/member-avatar";
import { formatDateTime } from "#/lib/dates";
import { cn } from "#/lib/utils";

export type PersonalActivityItem = {
	id: string;
	type: ActivityType;
	organizationId: string;
	actorUserId: string;
	actorName: string;
	groupName: string;
	createdAt: Date | string;
	metadata: Record<string, unknown>;
	deltaMinor: number | null;
	isMember: boolean;
	expenseId: string | null;
};

const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" ? value : 0);

const strong = (text: string) => (
	<strong className="font-semibold">{text}</strong>
);
const quoted = (text: string) => <>“{strong(text)}”</>;

const article: Record<string, string> = {
	owner: "an owner",
	admin: "an admin",
	member: "a member",
};

/**
 * The same event reads differently depending on who is looking, so every name
 * is resolved against the viewer: their own actions say "You", and anything
 * done to them says "you".
 */
function sentence(
	item: PersonalActivityItem,
	viewerId: string,
	names: Record<string, string>,
) {
	const meta = item.metadata ?? {};
	const actor = strong(item.actorUserId === viewerId ? "You" : item.actorName);
	const person = (userId: string) =>
		userId === viewerId ? "you" : (names[userId] ?? "someone");
	const group = quoted(item.groupName);
	const description = str(meta.description);

	switch (item.type) {
		case "expense.created":
			return (
				<>
					{actor} added {quoted(description)} in {group}.
				</>
			);
		case "expense.updated":
			return (
				<>
					{actor} updated {quoted(description)} in {group}.
				</>
			);
		case "expense.deleted":
			return (
				<>
					{actor} deleted {quoted(description)} from {group}.
				</>
			);
		case "share.marked_paid":
		case "share.marked_unpaid": {
			const owner = str(meta.userId);
			const whose =
				owner === viewerId ? "your" : `${names[owner] ?? "someone"}'s`;
			const state = item.type === "share.marked_paid" ? "paid" : "unpaid";
			return (
				<>
					{actor} marked {strong(whose)} share
					{description ? <> of {quoted(description)}</> : null} as {state} in{" "}
					{group}.
				</>
			);
		}
		case "settlement.created":
			return (
				<>
					{actor} paid {strong(person(str(meta.toUserId)))} in {group}.
				</>
			);
		case "settlement.deleted":
			// Older rows only kept the amount, not who the payment was between.
			return meta.fromUserId ? (
				<>
					{actor} deleted a payment from {strong(person(str(meta.fromUserId)))}{" "}
					to {strong(person(str(meta.toUserId)))} in {group}.
				</>
			) : (
				<>
					{actor} deleted a payment in {group}.
				</>
			);
		case "member.invited":
			return (
				<>
					{actor} invited you to {group}.
				</>
			);
		case "member.joined":
			return <>You joined {group}.</>;
		case "member.removed":
			return (
				<>
					{actor} removed you from {group}.
				</>
			);
		case "member.left":
			return <>You left {group}.</>;
		case "member.role_changed":
			return (
				<>
					{actor} made you {article[str(meta.to)] ?? "a member"} of {group}.
				</>
			);
		default:
			return (
				<>
					{actor} changed {group}.
				</>
			);
	}
}

/**
 * The line under the sentence: what it came to for the viewer. Status colour
 * always travels with words that carry the same meaning, so nothing here
 * depends on colour alone.
 */
function outcome(item: PersonalActivityItem, viewerId: string): ReactNode {
	const meta = item.metadata ?? {};
	const currency = str(meta.currency) || "INR";
	const money = (minor: number) => (
		<Amount minor={Math.abs(minor)} currency={currency} />
	);

	switch (item.type) {
		case "expense.created":
		case "expense.updated":
		case "expense.deleted": {
			const delta = item.deltaMinor;
			if (delta === null) return null;
			const line =
				delta > 0 ? (
					<span className="text-positive">You get back {money(delta)}</span>
				) : delta < 0 ? (
					<span className="text-negative">You owe {money(delta)}</span>
				) : (
					<span className="text-muted-foreground">Nothing owed either way</span>
				);
			// A deleted expense no longer counts, so its old effect is struck out.
			return item.type === "expense.deleted" && delta !== 0 ? (
				<del className="opacity-80">
					<span className="sr-only">No longer applies: </span>
					{line}
				</del>
			) : (
				line
			);
		}
		case "share.marked_paid":
		case "share.marked_unpaid": {
			if (typeof meta.amountMinor !== "number") return null;
			const amount = money(num(meta.amountMinor));
			const mine = str(meta.userId) === viewerId;
			if (item.type === "share.marked_paid")
				return (
					<span className="text-positive">
						{mine ? "You paid back" : "You got back"} {amount}
					</span>
				);
			return mine ? (
				<span className="text-negative">You owe {amount} again</span>
			) : (
				<span className="text-positive">You get back {amount} again</span>
			);
		}
		case "settlement.created":
		case "settlement.deleted": {
			const amount = money(num(meta.amountMinor));
			const line = !meta.fromUserId ? (
				<span>{amount}</span>
			) : str(meta.fromUserId) === viewerId ? (
				<span>You paid {amount}</span>
			) : (
				<span>You received {amount}</span>
			);
			return item.type === "settlement.deleted" ? (
				<del className="text-muted-foreground">
					<span className="sr-only">No longer applies: </span>
					{line}
				</del>
			) : (
				<span className="text-positive">{line}</span>
			);
		}
		default:
			return null;
	}
}

export function PersonalActivityRow({
	item,
	viewerId,
	names,
}: {
	item: PersonalActivityItem;
	viewerId: string;
	names: Record<string, string>;
}) {
	const Icon = activityIcons[item.type] ?? Receipt;
	const detail = outcome(item, viewerId);
	const createdAt = new Date(item.createdAt);

	const body = (
		<>
			<span className="relative shrink-0">
				<span className="grid size-11 place-items-center rounded-xl border bg-muted text-foreground">
					<Icon className="size-5" aria-hidden="true" />
				</span>
				{/* Which group, at a glance, without reading to the end of the line. */}
				<MemberAvatar
					name={item.groupName}
					seed={item.organizationId}
					className="absolute -right-1.5 -bottom-1.5 size-5 ring-2 ring-card [&_[data-slot=avatar-fallback]]:text-[8px]"
				/>
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="text-pretty">{sentence(item, viewerId, names)}</span>
				{detail ? (
					<span className="tabular text-[0.9375rem] font-medium">{detail}</span>
				) : null}
				<time
					className="text-xs text-muted-foreground"
					dateTime={createdAt.toISOString()}
					title={createdAt.toLocaleString("en-IN")}
				>
					{formatDateTime(createdAt)}
				</time>
			</span>
		</>
	);

	const rowClass =
		"flex items-start gap-4 rounded-2xl px-3 py-3.5 text-sm no-underline sm:px-4";

	// Only somewhere you can still open is a link: a removed member, or an
	// expense that has since been deleted, has nowhere to go.
	if (item.isMember && item.expenseId)
		return (
			<Link
				to="/app/groups/$groupId/expenses/$expenseId"
				params={{ groupId: item.organizationId, expenseId: item.expenseId }}
				className={cn(rowClass, "press transition-colors hover:bg-muted/60")}
			>
				{body}
			</Link>
		);
	if (item.isMember)
		return (
			<Link
				to="/app/groups/$groupId"
				params={{ groupId: item.organizationId }}
				className={cn(rowClass, "press transition-colors hover:bg-muted/60")}
			>
				{body}
			</Link>
		);
	return <div className={rowClass}>{body}</div>;
}
