import { formatLongDate } from "@eventual/schemas/dates";
import { formatMinor } from "@eventual/schemas/money";
import { validateSharePayment } from "@eventual/schemas/settlements";
import { type EndpointOutput, isEventualApiError } from "@eventual/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Lock } from "lucide-react-native";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	RefreshControl,
	ScrollView,
	View,
} from "react-native";
import { Amount } from "../../../../../../components/amount";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
	Heading,
	Kicker,
	TAB_BAR_INSET,
} from "../../../../../../components/brand";
import { Checkbox } from "../../../../../../components/checkbox";
import { MemberAvatar } from "../../../../../../components/member-avatar";
import { idempotencyKey } from "../../../../../../lib/mutations";
import { usePullRefresh } from "../../../../../../lib/pull-refresh";
import { useApi } from "../../../../../../lib/session";
import { fonts, useTheme } from "../../../../../../theme";

type Expense = EndpointOutput<"expense.get">;

/* Same names as the web composer and detail page. */
const methodLabel = {
	even: "By group weight",
	exact: "Exact amounts",
	shares: "By ratio",
	percent: "By percentage",
} as const;

const shortDate = (value: string | number | Date) =>
	new Date(value).toLocaleDateString("en-IN", {
		day: "numeric",
		month: "short",
	});

export default function ExpenseDetail() {
	const t = useTheme();
	const api = useApi();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { groupId, expenseId } = useLocalSearchParams<{
		groupId: string;
		expenseId: string;
	}>();
	const expense = useQuery({
		queryKey: ["expense", expenseId],
		queryFn: () => api.call("expense.get", { expenseId }),
	});
	const context = useQuery({
		queryKey: ["group", groupId, "context"],
		queryFn: () => api.call("app.groupContext", { groupId }),
	});
	const summary = useQuery({
		queryKey: ["group", groupId, "summary"],
		queryFn: () => api.call("app.groupSummary", { groupId }),
	});
	const pull = usePullRefresh(() =>
		Promise.all([expense.refetch(), summary.refetch()]),
	);
	const [error, setError] = useState("");

	/** Paid shares move balances, so everything showing them refetches. */
	async function refreshAround(updated?: Expense) {
		if (updated) queryClient.setQueryData(["expense", expenseId], updated);
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["group", groupId] }),
			queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
		]);
	}

	const toggle = useMutation({
		mutationFn: ({ userId, paid }: { userId: string; paid: boolean }) =>
			api.call(
				"share.paid",
				{ expenseId, userId, paid },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: (updated) => refreshAround(updated),
		onError: (cause) =>
			setError(
				isEventualApiError(cause)
					? cause.message
					: "Couldn’t update that share. Check your connection and try again.",
			),
	});

	const remove = useMutation({
		mutationFn: () =>
			api.call(
				"expense.delete",
				{ expenseId },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: async () => {
			queryClient.removeQueries({ queryKey: ["expense", expenseId] });
			await refreshAround();
			router.back();
		},
		onError: (cause) =>
			setError(
				isEventualApiError(cause)
					? cause.message
					: "Couldn’t delete this expense. Check your connection and try again.",
			),
	});

	function confirmDelete(row: Expense) {
		Alert.alert(
			"Delete this expense?",
			`“${row.description}” for ${formatMinor(row.amountMinor, row.currency)} will be removed for everyone, along with its shares.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete expense",
					style: "destructive",
					onPress: () => remove.mutate(),
				},
			],
		);
	}

	const data = expense.data;
	const group = context.data?.group;
	const weighted =
		group?.members.some(
			(member) => member.weight !== group.members[0]?.weight,
		) ?? false;
	const transfers = summary.data?.balances.transfers ?? [];
	// The payer's own share is never owed to anyone.
	const owing =
		data?.shares.filter((share) => share.userId !== data.paidByUserId) ?? [];

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: t.canvas }}
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				paddingHorizontal: 20,
				paddingTop: 8,
				paddingBottom: TAB_BAR_INSET,
				gap: 20,
			}}
			refreshControl={<RefreshControl {...pull} tintColor={t.mutedInk} />}
		>
			{!data ? (
				expense.isError ? (
					<Card>
						<Heading>
							{isEventualApiError(expense.error) && expense.error.status === 404
								? "This expense was deleted"
								: "Couldn’t load this expense"}
						</Heading>
						<GlassButton
							label="Try again"
							onPress={() => void expense.refetch()}
						/>
					</Card>
				) : (
					<ActivityIndicator color={t.mutedInk} style={{ marginTop: 40 }} />
				)
			) : (
				<>
					<Card elevated>
						<View style={{ gap: 10 }}>
							<Kicker>
								{data.splitMethod === "even" && !weighted
									? "Split evenly"
									: methodLabel[data.splitMethod]}
							</Kicker>
							<Display>{data.description}</Display>
							<View
								style={{
									flexDirection: "row",
									flexWrap: "wrap",
									alignItems: "baseline",
									columnGap: 8,
								}}
							>
								<Amount
									minor={data.amountMinor}
									currency={data.currency}
									size={26}
								/>
								<Body tone="muted">· paid by {data.payer.name}</Body>
								<Body tone="muted">· {formatLongDate(data.date)}</Body>
							</View>
						</View>
						{data.category ? (
							<Body tone="muted" size={15}>
								Category · {data.category}
							</Body>
						) : null}
						{data.notes ? (
							<View
								style={{
									borderTopWidth: 1,
									borderTopColor: t.border,
									paddingTop: 14,
								}}
							>
								<Body tone="muted" size={15}>
									{data.notes}
								</Body>
							</View>
						) : null}
					</Card>

					{data.locked ? (
						<View
							accessibilityRole="alert"
							style={{
								flexDirection: "row",
								gap: 12,
								padding: 18,
								borderRadius: 18,
								borderWidth: 1,
								borderColor: `${t.warning}66`,
								backgroundColor: `${t.warning}1A`,
							}}
						>
							<Lock size={20} color={t.warning} style={{ marginTop: 2 }} />
							<View style={{ flex: 1, gap: 4 }}>
								<Body style={{ fontFamily: fonts.semibold, color: t.warning }}>
									Locked
								</Body>
								<Body size={15} style={{ color: t.warning }}>
									{data.lockedBy.length === 1
										? `${data.lockedBy[0].name}’s share was marked paid${
												data.lockedBy[0].paidAt
													? ` on ${shortDate(data.lockedBy[0].paidAt)}`
													: ""
											}. Unmark it to edit or delete this expense.`
										: `${data.lockedBy.length} shares are marked paid. Unmark them to edit or delete this expense.`}
								</Body>
							</View>
						</View>
					) : null}

					<Card>
						<View
							style={{
								flexDirection: "row",
								alignItems: "baseline",
								justifyContent: "space-between",
							}}
						>
							<Heading>Who owes what</Heading>
							<Body tone="muted" size={14}>
								{owing.filter((share) => share.paidAt !== null).length} of{" "}
								{owing.length} paid
							</Body>
						</View>
						<View style={{ gap: 16 }}>
							{data.shares.map((share) => {
								const paid = share.paidAt !== null;
								const isPayer = share.userId === data.paidByUserId;
								const blocked = validateSharePayment(transfers, {
									fromUserId: share.userId,
									toUserId: data.paidByUserId,
									currency: data.currency,
									amountMinor: share.amountMinor,
									paid: !paid,
									hasAllocations: share.allocations.length > 0,
								});
								const saving =
									toggle.isPending && toggle.variables?.userId === share.userId;
								return (
									<View
										key={share.id}
										style={{
											flexDirection: "row",
											alignItems: "center",
											gap: 12,
										}}
									>
										<MemberAvatar
											name={share.user.name}
											seed={share.userId}
											image={share.user.image}
										/>
										<View style={{ flex: 1 }}>
											<Body weight="semibold" numberOfLines={1}>
												{share.userId === context.data?.user.id
													? `${share.user.name} (you)`
													: share.user.name}
											</Body>
											<Body size={14} tone={paid ? "positive" : "muted"}>
												{isPayer
													? "Paid the bill"
													: paid && share.paidAt
														? `Paid ${shortDate(share.paidAt)}`
														: "Unpaid"}
											</Body>
										</View>
										<Amount
											minor={share.amountMinor}
											currency={data.currency}
											size={16}
										/>
										{/* A payer can still unmark their own share: it locks the expense. */}
										{isPayer && !paid ? (
											<View style={{ width: 24 }} />
										) : (
											<Checkbox
												checked={paid}
												busy={saving}
												disabled={toggle.isPending}
												blockedReason={blocked}
												label={`${share.user.name}'s share paid`}
												onChange={(next) =>
													toggle.mutate({ userId: share.userId, paid: next })
												}
											/>
										)}
									</View>
								);
							})}
						</View>
					</Card>

					{error ? <FormMessage>{error}</FormMessage> : null}

					{data.locked ? null : (
						<View style={{ flexDirection: "row", gap: 10 }}>
							<View style={{ flex: 1 }}>
								<GlassButton
									prominent
									label="Edit"
									onPress={() =>
										router.push({
											pathname: "/group/[groupId]/expense/compose",
											params: { groupId, expenseId },
										})
									}
								/>
							</View>
							<View style={{ flex: 1 }}>
								<GlassButton
									destructive
									label={remove.isPending ? "Deleting…" : "Delete"}
									busy={remove.isPending}
									onPress={() => confirmDelete(data)}
								/>
							</View>
						</View>
					)}
				</>
			)}
		</ScrollView>
	);
}
