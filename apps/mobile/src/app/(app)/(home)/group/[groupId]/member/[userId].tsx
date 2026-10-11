import { can } from "@eventual/schemas/permissions";
import { isEventualApiError } from "@eventual/sdk";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import {
	Body,
	Card,
	Display,
	Field,
	FormMessage,
	GlassButton,
	Heading,
	Screen,
} from "../../../../../../components/brand";
import { MemberAvatar } from "../../../../../../components/member-avatar";
import { Segmented } from "../../../../../../components/segmented";
import { idempotencyKey } from "../../../../../../lib/mutations";
import {
	useGroupContext,
	useRefreshAfterWrite,
} from "../../../../../../lib/queries";
import { useApi } from "../../../../../../lib/session";
import { fonts, useTheme } from "../../../../../../theme";

/** Short versions of the web's role descriptions. */
const roleHelp = {
	member: "Adds expenses and settles up.",
	admin: "Also manages members, weights and the group.",
	owner: "Also changes roles and can delete the group.",
} as const;

const errorText = (cause: unknown, fallback: string) =>
	isEventualApiError(cause) ? cause.message : fallback;

export default function ManageMember() {
	const api = useApi();
	const router = useRouter();
	const refresh = useRefreshAfterWrite();
	const { groupId, userId } = useLocalSearchParams<{
		groupId: string;
		userId: string;
	}>();
	const context = useGroupContext(groupId);
	const member = context.data?.group.members.find(
		(row) => row.userId === userId,
	);
	const myRole = context.data?.group.myRole ?? "member";
	const isSelf = userId === context.data?.user.id;
	const archived = Boolean(context.data?.group.archivedAt);
	const [error, setError] = useState("");

	const onError = (fallback: string) => (cause: unknown) =>
		setError(errorText(cause, fallback));

	const role = useMutation({
		mutationFn: (next: "member" | "admin") =>
			api.call(
				"member.role",
				{ groupId, userId, role: next },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: () => refresh(groupId),
		onError: onError("Couldn’t change their role."),
	});
	const remove = useMutation({
		mutationFn: () =>
			api.call(
				"member.remove",
				{ groupId, userId },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: async () => {
			await refresh(groupId);
			router.back();
		},
		onError: onError("Couldn’t remove them."),
	});

	if (!member)
		return (
			<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
				<Body tone="muted">
					{context.isPending ? "Loading…" : "They’re no longer in this group."}
				</Body>
			</Screen>
		);

	const canWeigh = !archived && can(myRole, "member", "update");
	const canChangeRole =
		!archived && can(myRole, "member", "role") && member.role !== "owner";
	// Mirrors the server: removing an admin needs the right to change roles.
	const canRemove =
		!archived &&
		!isSelf &&
		can(myRole, "member", "delete") &&
		(member.role === "member" || can(myRole, "member", "role"));
	const canEditGuest =
		!archived && member.isGuest && can(myRole, "member", "update");

	return (
		<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
			<View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
				<MemberAvatar
					name={member.name}
					seed={member.userId}
					image={member.image}
					size={52}
				/>
				<View style={{ flex: 1, gap: 2 }}>
					<Display size={26}>{member.name}</Display>
					<Body tone="muted" size={15} numberOfLines={1}>
						{member.isGuest
							? member.invitedEmail
								? `Guest · invited ${member.invitedEmail}`
								: "Guest"
							: (member.email ?? "")}
					</Body>
				</View>
			</View>

			{member.bio ? <Body tone="muted">{member.bio}</Body> : null}

			{canWeigh ? (
				<WeightStepper
					groupId={groupId}
					userId={userId}
					weight={member.weight}
					onError={setError}
				/>
			) : null}

			{canChangeRole ? (
				<Card style={{ gap: 12 }}>
					<Heading>Role</Heading>
					<Segmented
						value={member.role === "admin" ? "admin" : "member"}
						onChange={(next) => {
							if (next !== member.role) role.mutate(next);
						}}
						options={[
							{ value: "member", label: "Member" },
							{ value: "admin", label: "Admin" },
						]}
					/>
					<Body tone="muted" size={14}>
						{roleHelp[member.role as keyof typeof roleHelp] ?? roleHelp.member}
					</Body>
				</Card>
			) : (
				<Body tone="muted" size={15}>
					{member.role.charAt(0).toUpperCase() + member.role.slice(1)} ·{" "}
					{roleHelp[member.role as keyof typeof roleHelp] ?? roleHelp.member}
				</Body>
			)}

			{canEditGuest ? (
				<GuestDetails
					groupId={groupId}
					userId={userId}
					name={member.name}
					email={member.invitedEmail ?? ""}
					onError={setError}
				/>
			) : null}

			{error ? <FormMessage>{error}</FormMessage> : null}

			{canRemove ? (
				<GlassButton
					destructive
					label={remove.isPending ? "Removing…" : "Remove from group"}
					busy={remove.isPending}
					onPress={() =>
						Alert.alert(
							`Remove ${member.name}?`,
							`${member.name} loses access immediately. Their shares in expenses already recorded stay put.`,
							[
								{ text: "Cancel", style: "cancel" },
								{
									text: "Remove",
									style: "destructive",
									onPress: () => remove.mutate(),
								},
							],
						)
					}
				/>
			) : null}
			{!canWeigh && !canChangeRole && !canRemove ? (
				<Body tone="muted" size={14}>
					Only owners and admins can change members.
				</Body>
			) : null}
		</Screen>
	);
}

/**
 * − n + for a member's even-split weight. The number updates on each tap and
 * saves once the taps stop, so going 1 → 4 is one write, as on the web.
 */
function WeightStepper({
	groupId,
	userId,
	weight,
	onError,
}: {
	groupId: string;
	userId: string;
	weight: number;
	onError: (message: string) => void;
}) {
	const t = useTheme();
	const api = useApi();
	const refresh = useRefreshAfterWrite();
	const [value, setValue] = useState(weight);
	const pending = useRef<number | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const commit = useRef(() => {});
	commit.current = () => {
		clearTimeout(timer.current);
		const next = pending.current;
		pending.current = null;
		if (next === null || next === weight) return;
		api
			.call(
				"member.weight",
				{ groupId, userId, weight: next },
				{ idempotencyKey: idempotencyKey() },
			)
			.then(() => refresh(groupId))
			.catch((cause) => {
				setValue(weight);
				onError(errorText(cause, "Couldn’t save the weight."));
			});
	};
	// Leaving mid-pause still saves.
	useEffect(() => () => commit.current(), []);
	useEffect(() => {
		if (pending.current === null) setValue(weight);
	}, [weight]);

	function change(next: number) {
		setValue(next);
		pending.current = next;
		clearTimeout(timer.current);
		timer.current = setTimeout(() => commit.current(), 600);
	}

	const step = (
		label: string,
		glyph: string,
		next: number,
		disabled: boolean,
	) => (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			disabled={disabled}
			onPress={() => change(next)}
			style={({ pressed }) => ({
				width: 44,
				height: 44,
				borderRadius: 22,
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: pressed ? t.border : t.muted,
				opacity: disabled ? 0.4 : 1,
			})}
		>
			<Body
				style={{ fontFamily: fonts.semibold, fontSize: 22, lineHeight: 26 }}
			>
				{glyph}
			</Body>
		</Pressable>
	);

	return (
		<Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
			<View style={{ flex: 1, gap: 2 }}>
				<Heading>Weight</Heading>
				<Body tone="muted" size={14}>
					How much they count for in an even split
				</Body>
			</View>
			{step("Decrease weight", "−", value - 1, value <= 1)}
			<Body
				accessibilityLiveRegion="polite"
				style={{
					fontFamily: fonts.bold,
					fontSize: 20,
					minWidth: 28,
					textAlign: "center",
					fontVariant: ["tabular-nums"],
				}}
			>
				{value}
			</Body>
			{step("Increase weight", "+", value + 1, false)}
		</Card>
	);
}

function GuestDetails({
	groupId,
	userId,
	name: initialName,
	email: initialEmail,
	onError,
}: {
	groupId: string;
	userId: string;
	name: string;
	email: string;
	onError: (message: string) => void;
}) {
	const api = useApi();
	const refresh = useRefreshAfterWrite();
	const [name, setName] = useState(initialName);
	const [email, setEmail] = useState(initialEmail);
	const changed = name.trim() !== initialName || email.trim() !== initialEmail;
	const save = useMutation({
		mutationFn: () =>
			api.call(
				"member.updateGuest",
				{
					groupId,
					userId,
					name: name.trim(),
					email: email.trim() || null,
				},
				{ idempotencyKey: idempotencyKey() },
			),
		onSuccess: () => refresh(groupId),
		onError: (cause) =>
			onError(errorText(cause, "Couldn’t save their details.")),
	});
	return (
		<Card>
			<Heading>Guest details</Heading>
			<Field label="Name" value={name} onChangeText={setName} maxLength={100} />
			<Field
				label="Email"
				placeholder="Add one to invite them"
				value={email}
				onChangeText={setEmail}
				keyboardType="email-address"
				autoCapitalize="none"
				autoCorrect={false}
			/>
			<GlassButton
				label={save.isPending ? "Saving…" : "Save details"}
				busy={save.isPending}
				disabled={!changed || !name.trim()}
				onPress={() => save.mutate()}
			/>
		</Card>
	);
}
