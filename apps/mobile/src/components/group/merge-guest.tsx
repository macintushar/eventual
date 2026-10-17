import { isEventualApiError } from "@eventual/sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowRight, Check, Merge } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { idempotencyKey } from "../../lib/mutations";
import { useGroupContext } from "../../lib/queries";
import { useApi, useSession } from "../../lib/session";
import { useTheme } from "../../theme";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
	Heading,
	Screen,
} from "../brand";
import { MemberAvatar } from "../member-avatar";
import {
	canStartGuestMerge,
	guestMergeProblem,
	guestMergeReviewKey,
	isMergeSource,
} from "./guest-merge-policy";

export function MergeGuest({
	groupId,
	initialGuestId = "",
}: {
	groupId: string;
	initialGuestId?: string;
}) {
	const t = useTheme();
	const api = useApi();
	const { user } = useSession();
	const router = useRouter();
	const client = useQueryClient();
	const context = useGroupContext(groupId);
	const [guestId, setGuestId] = useState(initialGuestId);
	const [targetId, setTargetId] = useState("");
	const [reviewKey, setReviewKey] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [completed, setCompleted] = useState(false);
	const group = context.data?.group;
	const source = group?.members.find((row) => row.userId === guestId);
	const target = group?.members.find((row) => row.userId === targetId);
	const problem = group
		? guestMergeProblem(group, user, guestId, targetId)
		: "Loading members…";
	const reviewed = Boolean(
		group &&
			user &&
			!problem &&
			reviewKey === guestMergeReviewKey(group, user, guestId, targetId),
	);

	// Refetch before both review and write: cached roles/members are not authority.
	async function freshSelection() {
		const [latest, session] = await Promise.all([
			context.refetch(),
			api.call("session.get", {}),
		]);
		if (latest.isError || !latest.data)
			throw new Error(
				"Couldn’t refresh members. Check your connection and try again.",
			);
		const latestUser = session?.user ?? null;
		const reason = guestMergeProblem(
			latest.data.group,
			latestUser,
			guestId,
			targetId,
		);
		if (reason || !latestUser) throw new Error(reason ?? "Sign in again.");
		return guestMergeReviewKey(
			latest.data.group,
			latestUser,
			guestId,
			targetId,
		);
	}
	const onError = (cause: unknown) =>
		setError(
			isEventualApiError(cause) || cause instanceof Error
				? cause.message
				: "Couldn’t merge the guest. Check your connection and try again.",
		);
	const review = useMutation({
		mutationFn: freshSelection,
		onMutate: () => {
			setError("");
			setReviewKey(null);
		},
		onSuccess: setReviewKey,
		onError,
	});
	const merge = useMutation({
		mutationFn: async () => {
			const latestKey = await freshSelection();
			if (!reviewKey || latestKey !== reviewKey) {
				setReviewKey(null);
				throw new Error(
					"Members or permissions changed. Review the merge again.",
				);
			}
			return api.call(
				"member.merge",
				{ guestUserId: guestId, targetUserId: targetId },
				{ idempotencyKey: idempotencyKey() },
			);
		},
		onMutate: () => setError(""),
		onSuccess: async () => {
			setCompleted(true);
			// This is a global identity rewrite, not just a change to this group.
			await Promise.all([
				...(
					[
						"group",
						"dashboard",
						"expense",
						"activity",
						"group-directory",
						"invitation",
					] as const
				).map((key) => client.invalidateQueries({ queryKey: [key] })),
			]);
		},
		onError,
	});
	const busy = review.isPending || merge.isPending;
	const leave = () =>
		router.dismissTo({ pathname: "/group/[groupId]", params: { groupId } });

	if (completed)
		return (
			<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
				<Check size={28} color={t.positive} />
				<Display size={28}>Guest merged</Display>
				<Body>
					The guest identity was removed and its records now belong to your
					account.
				</Body>
				<GlassButton label="Done" onPress={leave} prominent />
			</Screen>
		);

	return (
		<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
			<View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
				<Merge size={26} color={t.ink} />
				<Display size={28}>Merge a guest</Display>
			</View>
			<Body tone="muted">
				Use this only when the guest is another identity for you. The existing
				server only lets you merge into your own account.
			</Body>
			{context.isPending ? <Body tone="muted">Loading members…</Body> : null}
			{context.isError ? (
				<FormMessage>
					Couldn’t refresh members. Refresh before reviewing or confirming.
				</FormMessage>
			) : null}
			{group && canStartGuestMerge(group) ? (
				<>
					<Card>
						<Heading>Guest to remove</Heading>
						{group.members
							.filter((row) => isMergeSource(row, user?.id ?? ""))
							.map((member) => (
								<Pressable
									key={member.userId}
									accessibilityRole="radio"
									accessibilityLabel={`${member.name}, guest to remove`}
									accessibilityState={{
										selected: guestId === member.userId,
										disabled: busy,
									}}
									disabled={busy}
									onPress={() => {
										setGuestId(member.userId);
										setReviewKey(null);
										setError("");
									}}
									style={({ pressed }) => ({
										flexDirection: "row",
										alignItems: "center",
										gap: 12,
										minHeight: 52,
										opacity: pressed ? 0.6 : 1,
									})}
								>
									<MemberAvatar
										name={member.name}
										seed={member.userId}
										image={member.image}
										size={36}
									/>
									<Body style={{ flex: 1 }}>{member.name}</Body>
									{guestId === member.userId ? (
										<Check size={20} color={t.ink} />
									) : null}
								</Pressable>
							))}
						{!group.members.some((row) =>
							isMergeSource(row, user?.id ?? ""),
						) ? (
							<Body tone="muted">
								No unclaimed guests with the Member role are available.
							</Body>
						) : null}
					</Card>
					<Card>
						<Heading>Account to keep</Heading>
						<GlassButton
							label={
								targetId === user?.id
									? `${user?.name} (you) · selected`
									: `${user?.name ?? "Your account"} (you)`
							}
							disabled={busy || !user?.emailVerified || Boolean(user?.isGuest)}
							onPress={() => {
								setTargetId(user?.id ?? "");
								setReviewKey(null);
								setError("");
							}}
						/>
						<Body tone="muted" size={14}>
							Only your signed-in, verified account is eligible. The server also
							checks that it has sign-in credentials.
						</Body>
						{!user?.emailVerified ? (
							<FormMessage>
								Verify your account’s email before merging.
							</FormMessage>
						) : null}
					</Card>
				</>
			) : null}
			{problem && group ? (
				<FormMessage tone="muted">{problem}</FormMessage>
			) : null}
			{reviewed && source && target ? (
				<Card>
					<Heading>Review the consequences</Heading>
					<View
						style={{
							flexDirection: "row",
							alignItems: "center",
							gap: 10,
							flexWrap: "wrap",
						}}
					>
						<Body weight="semibold">{source.name}</Body>
						<ArrowRight size={18} color={t.mutedInk} />
						<Body weight="semibold">{target.name} (you)</Body>
					</View>
					<Body>
						In {group?.name}, your existing membership and role stay. Both
						membership weights are {source.weight}.
					</Body>
					<Body>
						The server moves the guest’s memberships, expense shares, payer and
						creator references, payments, activity references and contact
						channels to your account, then deletes the guest identity and
						revokes its claim links.
					</Body>
					<Body tone="muted" size={14}>
						This applies across every group the guest touches, not just this
						group. This preview has no global counts or balance forecast. You
						must be an owner or admin in every affected group.
					</Body>
					<Body tone="muted" size={14}>
						The server rejects share collisions, debts or payments that would
						become self-payments, conflicting weights, non-Member guest roles,
						authentication artifacts and scheduled payloads referencing the
						guest. These checks run together in a transaction; a rejected merge
						makes no changes.
					</Body>
					<Body tone="negative" weight="semibold">
						This cannot be undone in the app. Confirm only if these identities
						are the same person.
					</Body>
				</Card>
			) : null}
			{error ? <FormMessage>{error}</FormMessage> : null}
			{reviewKey && !reviewed && !problem ? (
				<FormMessage>Members changed. Review the merge again.</FormMessage>
			) : null}
			{reviewed ? (
				<GlassButton
					label={
						merge.isPending ? "Merging…" : "Confirm merge and remove guest"
					}
					destructive
					busy={busy}
					disabled={context.isError || context.isFetching}
					onPress={() => merge.mutate()}
				/>
			) : (
				<GlassButton
					label={review.isPending ? "Refreshing…" : "Review merge"}
					busy={busy}
					disabled={Boolean(problem)}
					onPress={() => review.mutate()}
				/>
			)}
			<GlassButton
				label={context.isFetching ? "Refreshing members…" : "Refresh members"}
				disabled={busy || context.isFetching}
				onPress={() => {
					setError("");
					void context.refetch();
				}}
			/>
			<GlassButton
				label="Cancel"
				disabled={busy}
				onPress={() => router.back()}
			/>
		</Screen>
	);
}
