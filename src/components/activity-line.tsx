import {
	ArrowLeftRight,
	CircleCheck,
	CircleSlash,
	FolderPlus,
	LogOut,
	type LucideIcon,
	Mail,
	MailX,
	PencilLine,
	Receipt,
	ReceiptText,
	Shield,
	Trash2,
	UserMinus,
	UserPlus,
} from "lucide-react";
import type { ReactNode } from "react";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "#/components/ui/item";
import type { activityTypes } from "#/db/schema";
import { formatMinor } from "#/lib/money";

type ActivityType = (typeof activityTypes)[number];

export type ActivityItem = {
	id: string;
	type: ActivityType;
	actorName: string;
	createdAt: Date | string;
	metadata: Record<string, unknown>;
};

const icons: Record<ActivityType, LucideIcon> = {
	"group.created": FolderPlus,
	"group.renamed": PencilLine,
	"group.deleted": Trash2,
	"member.invited": Mail,
	"member.invite_revoked": MailX,
	"member.joined": UserPlus,
	"member.removed": UserMinus,
	"member.left": LogOut,
	"member.role_changed": Shield,
	"expense.created": Receipt,
	"expense.updated": ReceiptText,
	"expense.deleted": Trash2,
	"share.marked_paid": CircleCheck,
	"share.marked_unpaid": CircleSlash,
	"settlement.created": ArrowLeftRight,
	"settlement.deleted": Trash2,
};

const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" ? value : 0);

const strong = (text: string) => (
	<strong className="font-semibold">{text}</strong>
);

/**
 * Renders an activity row as a sentence rather than a raw event name.
 * `nameOf` resolves the user ids stored in metadata to display names.
 */
function sentence(item: ActivityItem, nameOf: (userId: string) => string) {
	const meta = item.metadata ?? {};
	const actor = strong(item.actorName);
	switch (item.type) {
		case "group.created":
			return (
				<>
					{actor} created {strong(str(meta.name))}
				</>
			);
		case "group.renamed":
			return (
				<>
					{actor} renamed the group from {strong(str(meta.from))} to{" "}
					{strong(str(meta.to))}
				</>
			);
		case "group.deleted":
			return <>{actor} deleted the group</>;
		case "member.invited":
			return (
				<>
					{actor} invited {strong(str(meta.email))} as{" "}
					{str(meta.role) || "member"}
				</>
			);
		case "member.invite_revoked":
			return (
				<>
					{actor} revoked the invitation for {strong(str(meta.email))}
				</>
			);
		case "member.joined":
			return <>{actor} joined the group</>;
		case "member.removed":
			return (
				<>
					{actor} removed {strong(nameOf(str(meta.userId)))}
				</>
			);
		case "member.left":
			return <>{actor} left the group</>;
		case "member.role_changed":
			return (
				<>
					{actor} changed {strong(nameOf(str(meta.userId)))} from{" "}
					{str(meta.from)} to {str(meta.to)}
				</>
			);
		case "expense.created":
			return (
				<>
					{actor} added {strong(str(meta.description))} for{" "}
					<span className="tabular">{formatMinor(num(meta.amountMinor))}</span>
				</>
			);
		case "expense.updated": {
			const from = num(meta.fromAmountMinor);
			const to = num(meta.amountMinor);
			if (from !== to)
				return (
					<>
						{actor} changed {strong(str(meta.description))} from{" "}
						<span className="tabular">{formatMinor(from)}</span> to{" "}
						<span className="tabular">{formatMinor(to)}</span>
					</>
				);
			return (
				<>
					{actor} edited {strong(str(meta.description))}
				</>
			);
		}
		case "expense.deleted":
			return (
				<>
					{actor} deleted {strong(str(meta.description))} (
					<span className="tabular">{formatMinor(num(meta.amountMinor))}</span>)
				</>
			);
		case "share.marked_paid":
			return (
				<>
					{actor} marked {strong(nameOf(str(meta.userId)))}'s share paid
				</>
			);
		case "share.marked_unpaid":
			return (
				<>
					{actor} marked {strong(nameOf(str(meta.userId)))}'s share unpaid
				</>
			);
		case "settlement.created":
			return (
				<>
					{actor} recorded a payment to {strong(nameOf(str(meta.toUserId)))} of{" "}
					<span className="tabular">{formatMinor(num(meta.amountMinor))}</span>
				</>
			);
		case "settlement.deleted":
			return (
				<>
					{actor} deleted a settlement of{" "}
					<span className="tabular">{formatMinor(num(meta.amountMinor))}</span>
				</>
			);
	}
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 31536000000],
	["month", 2592000000],
	["day", 86400000],
	["hour", 3600000],
	["minute", 60000],
];
const relative = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });

export function relativeTime(value: Date | string) {
	const elapsed = Date.now() - new Date(value).getTime();
	for (const [unit, ms] of units)
		if (Math.abs(elapsed) >= ms)
			return relative.format(-Math.round(elapsed / ms), unit);
	return "just now";
}

export function ActivityLine({
	item,
	nameOf,
}: {
	item: ActivityItem;
	nameOf: (userId: string) => string;
}): ReactNode {
	const Icon = icons[item.type] ?? Receipt;
	return (
		<Item size="sm">
			<ItemMedia variant="icon">
				<Icon />
			</ItemMedia>
			<ItemContent>
				<ItemTitle className="font-normal">{sentence(item, nameOf)}</ItemTitle>
				<ItemDescription>
					<time
						dateTime={new Date(item.createdAt).toISOString()}
						title={new Date(item.createdAt).toLocaleString("en-IN")}
					>
						{relativeTime(item.createdAt)}
					</time>
				</ItemDescription>
			</ItemContent>
		</Item>
	);
}
