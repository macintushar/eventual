import {
	Archive,
	ArchiveRestore,
	ArrowLeftRight,
	CircleCheck,
	CircleSlash,
	Copy,
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
	UserPen,
	UserPlus,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import type { Outcome, Run } from "../lib/activity";
import { fonts, useTheme } from "../theme";
import { MemberAvatar } from "./member-avatar";

/** The web's icons for each event (`activity-line.tsx`). */
const activityIcons: Record<string, LucideIcon> = {
	"group.created": FolderPlus,
	"group.renamed": PencilLine,
	"group.archived": Archive,
	"group.unarchived": ArchiveRestore,
	"group.duplicated": Copy,
	"group.deleted": Trash2,
	"member.invited": Mail,
	"member.invite_revoked": MailX,
	"member.joined": UserPlus,
	"member.removed": UserMinus,
	"member.left": LogOut,
	"member.role_changed": Shield,
	"member.updated": UserPen,
	"expense.created": Receipt,
	"expense.updated": ReceiptText,
	"expense.deleted": Trash2,
	"share.marked_paid": CircleCheck,
	"share.marked_unpaid": CircleSlash,
	"settlement.created": ArrowLeftRight,
	"settlement.deleted": Trash2,
};

/**
 * One activity line: an icon tile (with a small group badge in the personal
 * feed), the sentence with names in bold, what it meant for you, and when.
 */
export function ActivityRow({
	type,
	sentence,
	outcome,
	time,
	group,
	onPress,
	first,
}: {
	type: string;
	sentence: Run[];
	outcome?: Outcome | null;
	time: string;
	group?: { id: string; name: string };
	onPress?: () => void;
	first?: boolean;
}) {
	const t = useTheme();
	const Icon = activityIcons[type] ?? Receipt;
	const text = sentence.map((run) => run.text).join("");
	const body = (
		<>
			<View style={{ width: 44, height: 44 }}>
				<View
					style={{
						width: 44,
						height: 44,
						borderRadius: 12,
						borderWidth: 1,
						borderColor: t.border,
						backgroundColor: t.muted,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Icon size={20} color={t.ink} />
				</View>
				{group ? (
					<View
						style={{
							position: "absolute",
							right: -6,
							bottom: -6,
							borderRadius: 12,
							borderWidth: 2,
							borderColor: t.paper,
						}}
					>
						<MemberAvatar name={group.name} seed={group.id} size={20} />
					</View>
				) : null}
			</View>
			<View style={{ flex: 1, gap: 3 }}>
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 15,
						lineHeight: 21,
						color: t.ink,
					}}
				>
					{sentence.map((run, index) => (
						<Text
							// Runs are positional: a sentence never reorders.
							// biome-ignore lint/suspicious/noArrayIndexKey: static runs
							key={index}
							style={run.bold ? { fontFamily: fonts.semibold } : undefined}
						>
							{run.text}
						</Text>
					))}
				</Text>
				{outcome ? (
					<Text
						style={{
							fontFamily: fonts.semibold,
							fontSize: 15,
							color:
								outcome.tone === "positive"
									? t.positive
									: outcome.tone === "negative"
										? t.negative
										: t.mutedInk,
							textDecorationLine: outcome.struck ? "line-through" : "none",
							opacity: outcome.struck ? 0.8 : 1,
							fontVariant: ["tabular-nums"],
						}}
					>
						{outcome.text}
					</Text>
				) : null}
				<Text
					style={{ fontFamily: fonts.body, fontSize: 13, color: t.mutedInk }}
				>
					{time}
				</Text>
			</View>
		</>
	);
	const style = {
		flexDirection: "row" as const,
		alignItems: "flex-start" as const,
		gap: 14,
		paddingVertical: 14,
		borderTopWidth: first ? 0 : 1,
		borderTopColor: t.border,
	};
	const label = `${text.replace(/\.$/, "")}${outcome ? `. ${outcome.struck ? "No longer applies: " : ""}${outcome.text}` : ""}. ${time}`;
	return onPress ? (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}
		>
			{body}
		</Pressable>
	) : (
		<View accessible accessibilityLabel={label} style={style}>
			{body}
		</View>
	);
}
