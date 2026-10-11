import { formatShortDate } from "@eventual/schemas/dates";
import type { EndpointOutput } from "@eventual/sdk";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Settings } from "lucide-react-native";
import { useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	View,
} from "react-native";
import { Amount } from "../../../../../components/amount";
import {
	Body,
	Card,
	Display,
	GlassButton,
	Heading,
	Kicker,
} from "../../../../../components/brand";
import { ActivityTab } from "../../../../../components/group/activity";
import { BalancesTab } from "../../../../../components/group/balances";
import {
	defaultExpenseSort,
	ExpenseSearchBar,
	type ExpenseSort,
	useDebounced,
} from "../../../../../components/group/expense-search";
import { MembersTab } from "../../../../../components/group/members";
import { Segmented } from "../../../../../components/segmented";
import { useGroupContext, useGroupSummary } from "../../../../../lib/queries";
import { useApi } from "../../../../../lib/session";
import { fonts, useTheme } from "../../../../../theme";

type Expense = EndpointOutput<"expense.page">["items"][number];

export default function GroupScreen() {
	const t = useTheme();
	const api = useApi();
	const router = useRouter();
	const { groupId } = useLocalSearchParams<{ groupId: string }>();
	const [tab, setTab] = useState<
		"expenses" | "balances" | "members" | "activity"
	>("expenses");
	const context = useGroupContext(groupId);
	const summary = useGroupSummary(groupId);
	const [searchText, setSearchText] = useState("");
	const [sort, setSort] = useState<ExpenseSort>(defaultExpenseSort);
	// Debounced so each keystroke isn't a request.
	const search = useDebounced(searchText.trim(), 300);
	const { sortBy, sortDirection } = sort;
	const expenses = useInfiniteQuery({
		// Search and sort are in the key so pages never mix; the
		// ["group", groupId] prefix keeps write invalidation working.
		queryKey: ["group", groupId, "expenses", { search, sortBy, sortDirection }],
		// Keeps the old rows on screen while a new search loads.
		placeholderData: keepPreviousData,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			api.call(
				"expense.page",
				{
					groupId,
					search: search || undefined,
					sortBy,
					sortDirection,
					cursor: pageParam,
					limit: 30,
				},
				{ signal },
			),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
	});
	const items = expenses.data?.pages.flatMap((page) => page.items) ?? [];
	const refreshing =
		context.isRefetching || summary.isRefetching || expenses.isRefetching;

	return (
		<>
			<Stack.Screen
				options={{
					// A header item, so iOS 26 draws it as Liquid Glass.
					headerRight: () => (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Group settings"
							// Fills the glass circle iOS draws around header items; the
							// icon alone was a 22 pt target.
							hitSlop={6}
							style={{
								width: 36,
								height: 36,
								alignItems: "center",
								justifyContent: "center",
							}}
							onPress={() =>
								router.push({
									pathname: "/group/[groupId]/settings",
									params: { groupId },
								})
							}
						>
							<Settings size={22} color={t.ink} />
						</Pressable>
					),
				}}
			/>
			<FlatList
				style={{ flex: 1, backgroundColor: t.canvas }}
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
				data={tab === "expenses" ? items : []}
				keyExtractor={(item) => item.id}
				renderItem={({ item, index }) => (
					<ExpenseRow
						expense={item}
						onPress={() => router.push(`/group/${groupId}/expense/${item.id}`)}
						first={index === 0}
						last={index === items.length - 1}
					/>
				)}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={() => {
							void context.refetch();
							void summary.refetch();
							void expenses.refetch();
						}}
						tintColor={t.mutedInk}
					/>
				}
				onEndReachedThreshold={0.5}
				onEndReached={() => {
					if (
						tab === "expenses" &&
						expenses.hasNextPage &&
						!expenses.isFetchingNextPage
					)
						void expenses.fetchNextPage();
				}}
				ListHeaderComponent={
					<View style={{ gap: 28, paddingTop: 8, paddingBottom: 14 }}>
						<Header
							context={context.data}
							summary={summary.data}
							failed={context.isError}
							onRetry={() => void context.refetch()}
						/>
						{context.data && !context.data.group.archivedAt ? (
							<GlassButton
								prominent
								label="Add expense"
								onPress={() =>
									router.push({
										pathname: "/group/[groupId]/expense/compose",
										params: { groupId },
									})
								}
							/>
						) : null}
						<Segmented
							value={tab}
							onChange={setTab}
							options={[
								{ value: "expenses", label: "Expenses" },
								{ value: "balances", label: "Balances" },
								{ value: "members", label: "Members" },
								{ value: "activity", label: "Activity" },
							]}
						/>
						{tab === "expenses" ? (
							<ExpenseSearchBar
								text={searchText}
								onChangeText={setSearchText}
								sort={sort}
								onChangeSort={setSort}
							/>
						) : null}
						{tab === "balances" ? <BalancesTab groupId={groupId} /> : null}
						{tab === "members" ? <MembersTab groupId={groupId} /> : null}
						{tab === "activity" ? <ActivityTab groupId={groupId} /> : null}
					</View>
				}
				ListEmptyComponent={
					tab !== "expenses" ? null : expenses.isPending ? (
						<ActivityIndicator color={t.mutedInk} style={{ marginTop: 24 }} />
					) : expenses.isError ? (
						<Card>
							<Body tone="muted">Couldn’t load expenses.</Body>
							<GlassButton
								label="Try again"
								onPress={() => void expenses.refetch()}
							/>
						</Card>
					) : search ? (
						<Card>
							<Heading>{`No expenses match “${search}”`}</Heading>
							<Body tone="muted">Try a different word.</Body>
						</Card>
					) : (
						<Card>
							<Heading>No expenses yet</Heading>
							<Body tone="muted">
								Add the first one and everyone’s share is worked out for you.
							</Body>
						</Card>
					)
				}
				ListFooterComponent={
					tab === "expenses" && items.length ? (
						<View style={{ paddingTop: 16 }}>
							{expenses.isFetchingNextPage ? (
								<ActivityIndicator color={t.mutedInk} />
							) : expenses.isFetchNextPageError ? (
								// Keeps the rows already loaded; only the next page failed.
								<GlassButton
									label="Couldn’t load more. Try again"
									onPress={() => void expenses.fetchNextPage()}
								/>
							) : null}
						</View>
					) : null
				}
			/>
		</>
	);
}

function Header({
	context,
	summary,
	failed,
	onRetry,
}: {
	context: EndpointOutput<"app.groupContext"> | undefined;
	summary: EndpointOutput<"app.groupSummary"> | undefined;
	failed: boolean;
	onRetry: () => void;
}) {
	if (!context)
		return failed ? (
			<Card>
				<Heading>Couldn’t load this group</Heading>
				<GlassButton label="Try again" onPress={onRetry} />
			</Card>
		) : (
			<View style={{ height: 96 }} />
		);
	const { group, user } = context;
	const mine = (summary?.balances.members ?? []).filter(
		(row) => row.userId === user.id && row.balanceMinor !== 0,
	);
	return (
		<View style={{ gap: 10 }}>
			<Kicker>
				{group.myRole.charAt(0).toUpperCase() + group.myRole.slice(1)}
			</Kicker>
			<Display>{group.name}</Display>
			<View
				style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}
			>
				<Body tone="muted">
					{group.members.length}{" "}
					{group.members.length === 1 ? "member" : "members"}
				</Body>
				{mine.map((row) => (
					<View
						key={row.currency}
						style={{ flexDirection: "row", alignItems: "baseline" }}
					>
						<Body tone="muted">
							{" · "}
							{row.balanceMinor > 0 ? "you are owed " : "you owe "}
						</Body>
						<Amount
							minor={row.balanceMinor}
							currency={row.currency}
							tone={row.balanceMinor > 0 ? "positive" : "negative"}
							size={16}
						/>
					</View>
				))}
			</View>
		</View>
	);
}

function ExpenseRow({
	expense,
	first,
	last,
	onPress,
}: {
	expense: Expense;
	onPress: () => void;
	first: boolean;
	last: boolean;
}) {
	const t = useTheme();
	const meta = [
		expense.payer.name,
		formatShortDate(expense.date),
		expense.category,
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<Pressable
			accessibilityRole="button"
			onPress={onPress}
			accessibilityLabel={`${expense.description}, ${meta}${expense.locked ? ", locked" : ""}`}
			style={({ pressed }) => ({
				opacity: pressed ? 0.7 : 1,
				flexDirection: "row",
				alignItems: "center",
				gap: 12,
				paddingHorizontal: 18,
				paddingVertical: 14,
				backgroundColor: t.paper,
				borderColor: t.border,
				borderLeftWidth: 1,
				borderRightWidth: 1,
				borderTopWidth: first ? 1 : 0,
				borderBottomWidth: 1,
				borderTopLeftRadius: first ? 18 : 0,
				borderTopRightRadius: first ? 18 : 0,
				borderBottomLeftRadius: last ? 18 : 0,
				borderBottomRightRadius: last ? 18 : 0,
			})}
		>
			<View style={{ flex: 1, gap: 2 }}>
				<Body weight="semibold" numberOfLines={1}>
					{expense.description}
				</Body>
				<Body tone="muted" size={14} numberOfLines={1}>
					{meta}
				</Body>
			</View>
			<View style={{ alignItems: "flex-end", gap: 4 }}>
				<Amount minor={expense.amountMinor} currency={expense.currency} />
				{expense.locked ? (
					<View
						style={{
							backgroundColor: t.muted,
							borderRadius: 999,
							paddingHorizontal: 8,
							paddingVertical: 1,
						}}
					>
						<Body size={12} style={{ fontFamily: fonts.medium }}>
							Locked
						</Body>
					</View>
				) : null}
			</View>
		</Pressable>
	);
}
