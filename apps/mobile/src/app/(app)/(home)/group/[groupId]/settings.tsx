import { formatMinor } from "@eventual/schemas/money";
import { can } from "@eventual/schemas/permissions";
import { isEventualApiError } from "@eventual/sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import {
	Body,
	Card,
	Display,
	Field,
	FormMessage,
	GlassButton,
	Heading,
	Screen,
} from "../../../../../components/brand";
import { SelectField } from "../../../../../components/select-field";
import { idempotencyKey } from "../../../../../lib/mutations";
import {
	useGroupContext,
	useGroupSummary,
	useRefreshAfterWrite,
} from "../../../../../lib/queries";
import { useApi } from "../../../../../lib/session";
import { useTheme } from "../../../../../theme";

const errorText = (cause: unknown, fallback: string) =>
	isEventualApiError(cause) ? cause.message : fallback;

type Pathname =
	| "/group/[groupId]/categories"
	| "/group/[groupId]/reminders"
	| "/group/[groupId]/export";

/** A tappable row that opens a sub-screen. */
function NavRow({
	title,
	detail,
	pathname,
	groupId,
}: {
	title: string;
	detail: string;
	pathname: Pathname;
	groupId: string;
}) {
	const t = useTheme();
	const router = useRouter();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${title}. ${detail}`}
			onPress={() => router.push({ pathname, params: { groupId } })}
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 12,
				minHeight: 56,
			}}
		>
			<View style={{ flex: 1 }}>
				<Body weight="medium">{title}</Body>
				<Body tone="muted" size={14}>
					{detail}
				</Body>
			</View>
			<ChevronRight size={20} color={t.mutedInk} />
		</Pressable>
	);
}

export default function GroupSettings() {
	const api = useApi();
	const router = useRouter();
	const queryClient = useQueryClient();
	const refresh = useRefreshAfterWrite();
	const { groupId } = useLocalSearchParams<{ groupId: string }>();
	const context = useGroupContext(groupId);
	const summary = useGroupSummary(groupId);
	// Undefined until edited, so the field follows the loaded name.
	const [draft, setDraft] = useState<string>();
	const [newOwnerId, setNewOwnerId] = useState("");
	const [error, setError] = useState("");

	const onError = (fallback: string) => (cause: unknown) =>
		setError(errorText(cause, fallback));

	const rename = useMutation({
		mutationFn: (name: string) =>
			api.call(
				"group.rename",
				{ groupId, name },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: async () => {
			setDraft(undefined);
			await refresh(groupId);
		},
		onError: onError("Couldn’t rename the group."),
	});
	const archive = useMutation({
		mutationFn: (archived: boolean) =>
			api.call(
				archived ? "group.archive" : "group.unarchive",
				{ groupId },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: () => refresh(groupId),
		onError: onError("Couldn’t update the group."),
	});
	const duplicate = useMutation({
		mutationFn: () =>
			api.call(
				"group.duplicate",
				{ groupId },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: async (copy) => {
			await refresh(groupId);
			// Back to the dashboard first, so back from the copy doesn't land here.
			router.dismissAll();
			router.push({
				pathname: "/group/[groupId]",
				params: { groupId: copy.id },
			});
		},
		onError: onError("Couldn’t duplicate the group."),
	});

	/** The group is gone for this user: leave its screens before dropping them. */
	async function exitGroup() {
		router.dismissAll();
		queryClient.removeQueries({ queryKey: ["group", groupId] });
		await refresh(groupId);
	}
	const leave = useMutation({
		mutationFn: () =>
			api.call(
				"group.leave",
				{ groupId, newOwnerId: newOwnerId || undefined },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: exitGroup,
		onError: onError("Couldn’t leave the group."),
	});
	const remove = useMutation({
		mutationFn: () =>
			api.call(
				"group.delete",
				{ groupId },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: exitGroup,
		onError: onError("Couldn’t delete the group."),
	});

	const group = context.data?.group;
	if (!group || !context.data)
		return (
			<Screen edges={["left", "right"]}>
				{context.isError ? (
					<Card>
						<Heading>Couldn’t load settings</Heading>
						<GlassButton
							label="Try again"
							onPress={() => void context.refetch()}
						/>
					</Card>
				) : (
					<ActivityIndicator style={{ marginTop: 40 }} />
				)}
			</Screen>
		);

	const meId = context.data.user.id;
	const archived = Boolean(group.archivedAt);
	const canEdit = can(group.myRole, "group", "update");
	const canDelete = can(group.myRole, "group", "delete");
	const isOwner = group.myRole === "owner";
	const busy =
		rename.isPending ||
		archive.isPending ||
		duplicate.isPending ||
		leave.isPending ||
		remove.isPending;

	const name = draft ?? group.name;
	const nameChanged = name.trim() !== "" && name.trim() !== group.name;

	// Leaving needs a zero balance; the server checks unpaid shares too.
	const unsettled = (summary.data?.balances.members ?? []).some(
		(row) => row.userId === meId && row.balanceMinor !== 0,
	);
	const debts = (summary.data?.balances.transfers ?? []).filter(
		(row) => row.from.userId === meId || row.to.userId === meId,
	);
	const owesSomeone = debts.some((row) => row.from.userId === meId);
	const heirs = group.members.filter(
		(member) => member.userId !== meId && !member.isGuest,
	);
	const heir = heirs.find((member) => member.userId === newOwnerId);

	function confirmArchive() {
		Alert.alert(
			"Archive this group?",
			"It becomes read-only. Balances and history stay, and you can unarchive it.",
			[
				{ text: "Cancel", style: "cancel" },
				{ text: "Archive", onPress: () => archive.mutate(true) },
			],
		);
	}

	function confirmLeave() {
		Alert.alert(
			`Leave “${group?.name}”?`,
			heir
				? `${heir.name} becomes the owner. You’ll need a new invite to rejoin.`
				: "You’ll need a new invite to rejoin. Your past expenses stay.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: heir ? "Hand over and leave" : "Leave",
					style: "destructive",
					onPress: () => leave.mutate(),
				},
			],
		);
	}

	function confirmDelete() {
		const others = (group?.members.length ?? 1) - 1;
		const open = summary.data?.balances.transfers.length ?? 0;
		Alert.alert(
			`Delete “${group?.name}”?`,
			`${
				others > 0 ? `Removed for all ${others + 1} members. ` : ""
			}${open > 0 ? `${open} unsettled ${open === 1 ? "debt" : "debts"} will be erased. ` : ""}This can’t be undone.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete group",
					style: "destructive",
					onPress: () => remove.mutate(),
				},
			],
		);
	}

	return (
		<Screen edges={["left", "right"]}>
			<Display size={32}>Settings</Display>

			{canEdit ? (
				<Card>
					<Field
						label="Group name"
						value={name}
						onChangeText={setDraft}
						maxLength={100}
						returnKeyType="done"
						onSubmitEditing={() => {
							if (nameChanged && !busy) rename.mutate(name.trim());
						}}
					/>
					<GlassButton
						label={rename.isPending ? "Saving…" : "Save name"}
						busy={rename.isPending}
						disabled={!nameChanged || busy}
						onPress={() => rename.mutate(name.trim())}
					/>
				</Card>
			) : archived ? (
				<Body tone="muted">
					This group is archived. An owner or admin can unarchive it.
				</Body>
			) : (
				<Body tone="muted">Only an owner or admin can rename or archive.</Body>
			)}

			<Card>
				<Heading>Automation and data</Heading>
				{can(group.myRole, "category", "read") ? (
					<NavRow
						title="Category rules"
						detail="File expenses under categories automatically"
						pathname="/group/[groupId]/categories"
						groupId={groupId}
					/>
				) : null}
				{can(group.myRole, "reminder", "read") ? (
					<NavRow
						title="Email reminders"
						detail="Nudge people about their balance"
						pathname="/group/[groupId]/reminders"
						groupId={groupId}
					/>
				) : null}
				{can(group.myRole, "expense", "read") ? (
					<NavRow
						title="Export"
						detail="Download expenses as CSV or PDF"
						pathname="/group/[groupId]/export"
						groupId={groupId}
					/>
				) : null}
			</Card>

			{canEdit ? (
				<Card>
					<Heading>{archived ? "Archived" : "Archive"}</Heading>
					<Body tone="muted" size={15}>
						{archived
							? "Read-only. Unarchive to add expenses again."
							: "Make the group read-only. Balances and history stay."}
					</Body>
					<GlassButton
						label={
							archive.isPending
								? archived
									? "Unarchiving…"
									: "Archiving…"
								: archived
									? "Unarchive"
									: "Archive"
						}
						busy={archive.isPending}
						disabled={busy}
						onPress={() =>
							archived ? archive.mutate(false) : confirmArchive()
						}
					/>
				</Card>
			) : null}

			{canEdit ? (
				<Card>
					<Heading>Duplicate</Heading>
					<Body tone="muted" size={15}>
						An empty copy with the same members, roles and weights.
					</Body>
					<GlassButton
						label={duplicate.isPending ? "Duplicating…" : "Duplicate group"}
						busy={duplicate.isPending}
						disabled={busy}
						onPress={() => duplicate.mutate()}
					/>
				</Card>
			) : null}

			<Card>
				<Heading>Leave group</Heading>
				{unsettled ? (
					<>
						<Body tone="muted" size={15}>
							{owesSomeone
								? "Settle up before you leave."
								: "You can leave once people have paid you back."}
						</Body>
						{debts.map((row) => (
							<Body
								key={`${row.from.userId}-${row.to.userId}-${row.currency}`}
								size={15}
							>
								{row.from.userId === meId
									? "You owe "
									: `${row.from.name} owes `}
								{row.to.userId === meId ? "you" : row.to.name}
								{" · "}
								{formatMinor(row.amountMinor, row.currency)}
							</Body>
						))}
						{owesSomeone ? (
							<GlassButton
								label="Record a payment"
								onPress={() =>
									router.push({
										pathname: "/group/[groupId]/record-payment",
										params: { groupId },
									})
								}
							/>
						) : null}
					</>
				) : isOwner && heirs.length === 0 ? (
					<Body tone="muted" size={15}>
						Every group needs an owner, and guests can’t be one. Add someone
						with an account to hand over to, or delete the group.
					</Body>
				) : (
					<>
						<Body tone="muted" size={15}>
							{isOwner
								? "Choose who takes over as owner first."
								: "You’ll need a new invite to rejoin."}
						</Body>
						{isOwner ? (
							<SelectField
								label="New owner"
								value={newOwnerId}
								placeholder="Choose a member"
								options={heirs.map((member) => ({
									value: member.userId,
									label: member.name,
								}))}
								onChange={setNewOwnerId}
							/>
						) : null}
						<GlassButton
							destructive
							label={
								leave.isPending
									? "Leaving…"
									: isOwner
										? "Hand over and leave"
										: "Leave group"
							}
							busy={leave.isPending}
							disabled={busy || (isOwner && !heir)}
							onPress={confirmLeave}
						/>
					</>
				)}
			</Card>

			{canDelete ? (
				<Card>
					<Heading>Delete group</Heading>
					<Body tone="muted" size={15}>
						Removes every expense, payment and activity record for everyone.
					</Body>
					<GlassButton
						destructive
						label={remove.isPending ? "Deleting…" : "Delete group"}
						busy={remove.isPending}
						disabled={busy}
						onPress={confirmDelete}
					/>
				</Card>
			) : null}

			{error ? (
				<View>
					<FormMessage>{error}</FormMessage>
				</View>
			) : null}
		</Screen>
	);
}
