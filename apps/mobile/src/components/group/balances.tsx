import { formatMinor, fromMinor } from "@eventual/schemas/money";
import { isEventualApiError } from "@eventual/sdk";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Alert, Linking, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { idempotencyKey } from "../../lib/mutations";
import {
	useGroupContext,
	useGroupSummary,
	useRefreshAfterWrite,
} from "../../lib/queries";
import { useApi } from "../../lib/session";
import { useTheme } from "../../theme";
import { Amount } from "../amount";
import { Body, Card, GlassButton, Heading } from "../brand";
import { MemberAvatar } from "../member-avatar";

export function BalancesTab({ groupId }: { groupId: string }) {
	const router = useRouter();
	const context = useGroupContext(groupId);
	const summary = useGroupSummary(groupId);
	if (!context.data || !summary.data)
		return summary.isError ? (
			<Card>
				<Body tone="muted">Couldn’t load balances.</Body>
				<GlassButton label="Try again" onPress={() => void summary.refetch()} />
			</Card>
		) : null;
	const me = context.data.user.id;
	const { balances, paymentIntents } = summary.data;
	const archived = Boolean(context.data.group.archivedAt);
	const currencies = [...new Set(balances.members.map((row) => row.currency))];
	const record = (params: Record<string, string> = {}) =>
		router.push({
			pathname: "/group/[groupId]/record-payment",
			params: { groupId, ...params },
		});

	return (
		<View style={{ gap: 20 }}>
			<Card>
				<Heading>Net balances</Heading>
				{currencies.map((currency) => {
					const rows = balances.members.filter(
						(row) => row.currency === currency,
					);
					const max = Math.max(
						1,
						...rows.map((row) => Math.abs(row.balanceMinor)),
					);
					return (
						<View key={currency} style={{ gap: 16 }}>
							{currencies.length > 1 ? (
								<Body tone="muted" size={13} weight="semibold">
									{currency}
								</Body>
							) : null}
							{rows.map((row) => (
								<View
									key={row.userId}
									accessible
									accessibilityLabel={`${row.name} ${
										row.balanceMinor === 0
											? "is settled up"
											: row.balanceMinor > 0
												? `is owed ${formatMinor(row.balanceMinor, currency)}`
												: `owes ${formatMinor(-row.balanceMinor, currency)}`
									}`}
									style={{ gap: 8 }}
								>
									<View
										style={{
											flexDirection: "row",
											alignItems: "center",
											gap: 12,
										}}
									>
										<MemberAvatar
											name={row.name}
											seed={row.userId}
											image={row.image}
											size={32}
										/>
										<Body weight="medium" numberOfLines={1} style={{ flex: 1 }}>
											{row.userId === me ? `${row.name} (you)` : row.name}
										</Body>
										<View style={{ alignItems: "flex-end" }}>
											<Amount
												minor={row.balanceMinor}
												currency={currency}
												tone="signed"
												size={16}
											/>
											<Body tone="muted" size={12}>
												{row.balanceMinor === 0
													? "settled"
													: row.balanceMinor > 0
														? "is owed"
														: "owes"}
											</Body>
										</View>
									</View>
									<BalanceBar minor={row.balanceMinor} max={max} />
								</View>
							))}
						</View>
					);
				})}
			</Card>

			<Card>
				<Heading>Settle up</Heading>
				{balances.transfers.length === 0 ? (
					<Body tone="positive" weight="medium">
						Everyone is settled up.
					</Body>
				) : (
					balances.transfers.map((transfer) => {
						const upiUrl =
							transfer.from.userId === me
								? paymentIntents.intents.find(
										(intent) =>
											intent.fromUserId === transfer.from.userId &&
											intent.toUserId === transfer.to.userId &&
											intent.currency === transfer.currency &&
											intent.amountMinor === transfer.amountMinor,
									)?.upiUrl
								: null;
						return (
							<TransferRow
								key={`${transfer.from.userId}-${transfer.to.userId}-${transfer.currency}`}
								from={transfer.from.userId === me ? "You" : transfer.from.name}
								to={transfer.to.userId === me ? "you" : transfer.to.name}
								amount={
									<Amount
										minor={transfer.amountMinor}
										currency={transfer.currency}
										size={17}
									/>
								}
								upiUrl={archived ? null : upiUrl}
								onRecord={
									archived
										? null
										: () =>
												record({
													from: transfer.from.userId,
													to: transfer.to.userId,
													currency: transfer.currency,
													amount: fromMinor(
														transfer.amountMinor,
														transfer.currency,
													),
												})
								}
							/>
						);
					})
				)}
				{archived ? null : (
					<GlassButton label="Record a payment" onPress={() => record({})} />
				)}
			</Card>

			<PaymentHistory groupId={groupId} archived={archived} />
		</View>
	);
}

function TransferRow({
	from,
	to,
	amount,
	upiUrl,
	onRecord,
}: {
	from: string;
	to: string;
	amount: React.ReactNode;
	upiUrl: string | null | undefined;
	onRecord: (() => void) | null;
}) {
	const t = useTheme();
	return (
		<View
			style={{
				gap: 12,
				padding: 16,
				borderRadius: 18,
				borderWidth: 1,
				borderColor: t.border,
			}}
		>
			<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
				<Body weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
					{from}
				</Body>
				<Svg width={14} height={14} viewBox="0 0 24 24" accessible={false}>
					<Path
						d="M5 12h14M13 6l6 6-6 6"
						stroke={t.mutedInk}
						strokeWidth={2}
						fill="none"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</Svg>
				<Body weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
					{to}
				</Body>
				<View style={{ flex: 1 }} />
				{amount}
			</View>
			{onRecord || upiUrl ? (
				<View style={{ flexDirection: "row", gap: 10 }}>
					{upiUrl ? (
						<View style={{ flex: 1 }}>
							<GlassButton
								label="Pay via UPI"
								onPress={() =>
									void Linking.openURL(upiUrl).catch(() =>
										Alert.alert(
											"No UPI app found",
											"Install a UPI app, or pay another way and record it here.",
										),
									)
								}
							/>
						</View>
					) : null}
					{onRecord ? (
						<View style={{ flex: 1 }}>
							<GlassButton prominent label="Record" onPress={onRecord} />
						</View>
					) : null}
				</View>
			) : null}
		</View>
	);
}

function PaymentHistory({
	groupId,
	archived,
}: {
	groupId: string;
	archived: boolean;
}) {
	const t = useTheme();
	const api = useApi();
	const refresh = useRefreshAfterWrite();
	const history = useInfiniteQuery({
		queryKey: ["group", groupId, "settlements"],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			api.call(
				"settlement.page",
				{ groupId, cursor: pageParam, limit: 20 },
				{ signal },
			),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
	});
	const remove = useMutation({
		mutationFn: (settlementId: string) =>
			api.call(
				"settlement.delete",
				{ settlementId },
				{ idempotencyKey: idempotencyKey() },
			),
		onSuccess: () => refresh(groupId),
		onError: (cause) =>
			Alert.alert(
				"Couldn’t delete the payment",
				isEventualApiError(cause)
					? cause.message
					: "Check your connection and try again.",
			),
	});
	const rows = history.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<Card>
			<Heading>Payment history</Heading>
			{history.isPending ? (
				<Body tone="muted">Loading payments…</Body>
			) : history.isError && rows.length === 0 ? (
				<>
					<Body tone="muted">Couldn’t load payments.</Body>
					<GlassButton
						label="Try again"
						onPress={() => void history.refetch()}
					/>
				</>
			) : rows.length === 0 ? (
				<Body tone="muted">No payments recorded yet.</Body>
			) : (
				rows.map((row) => {
					const amount = formatMinor(row.amountMinor, row.currency);
					return (
						<View
							key={row.id}
							style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
						>
							<View style={{ flex: 1 }}>
								<Body weight="medium">
									{row.from.name} paid {row.to.name}
								</Body>
								{row.note ? (
									<Body tone="muted" size={14} numberOfLines={2}>
										{row.note}
									</Body>
								) : null}
							</View>
							<Amount
								minor={row.amountMinor}
								currency={row.currency}
								size={16}
							/>
							{archived ? null : (
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={`Delete payment of ${amount}`}
									hitSlop={10}
									disabled={remove.isPending}
									onPress={() =>
										Alert.alert(
											"Delete payment?",
											`${amount} from ${row.from.name} to ${row.to.name} will be erased for everyone.`,
											[
												{ text: "Cancel", style: "cancel" },
												{
													text: "Delete payment",
													style: "destructive",
													onPress: () => remove.mutate(row.id),
												},
											],
										)
									}
									style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
								>
									<Svg width={20} height={20} viewBox="0 0 24 24">
										<Path
											d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
											stroke={t.negative}
											strokeWidth={2}
											fill="none"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</Svg>
								</Pressable>
							)}
						</View>
					);
				})
			)}
			{history.hasNextPage ? (
				<GlassButton
					label={
						history.isFetchingNextPage ? "Loading…" : "Show older payments"
					}
					busy={history.isFetchingNextPage}
					onPress={() => void history.fetchNextPage()}
				/>
			) : null}
		</Card>
	);
}

/**
 * Diverging bar from the web: negative grows left of the centre line,
 * positive right, so direction (not only colour) carries the sign.
 */
function BalanceBar({ minor, max }: { minor: number; max: number }) {
	const t = useTheme();
	const width = `${Math.min(Math.abs(minor) / max, 1) * 100}%` as const;
	return (
		<View
			importantForAccessibility="no-hide-descendants"
			style={{ flexDirection: "row", height: 6 }}
		>
			<View style={{ flex: 1, alignItems: "flex-end", paddingRight: 1 }}>
				{minor < 0 ? (
					<View
						style={{
							width,
							height: 6,
							backgroundColor: t.negative,
							borderTopLeftRadius: 4,
							borderBottomLeftRadius: 4,
						}}
					/>
				) : null}
			</View>
			<View style={{ width: 1, backgroundColor: t.border }} />
			<View style={{ flex: 1, alignItems: "flex-start", paddingLeft: 1 }}>
				{minor > 0 ? (
					<View
						style={{
							width,
							height: 6,
							backgroundColor: t.positive,
							borderTopRightRadius: 4,
							borderBottomRightRadius: 4,
						}}
					/>
				) : null}
			</View>
		</View>
	);
}
