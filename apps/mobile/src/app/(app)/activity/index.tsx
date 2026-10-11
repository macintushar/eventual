import { formatDateTime } from "@eventual/schemas/dates";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
	ActivityIndicator,
	FlatList,
	RefreshControl,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityRow } from "../../../components/activity-row";
import {
	Body,
	Card,
	Display,
	GlassButton,
	Heading,
	Kicker,
	Wordmark,
} from "../../../components/brand";
import { personalOutcome, personalSentence } from "../../../lib/activity";
import { useApi, useSession } from "../../../lib/session";
import { useTheme } from "../../../theme";

export default function Activity() {
	const t = useTheme();
	const api = useApi();
	const router = useRouter();
	const { user } = useSession();
	const viewerId = user?.id ?? "";
	const feed = useInfiniteQuery({
		queryKey: ["activity", "mine"],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			api.call("activity.mine", { cursor: pageParam, limit: 30 }, { signal }),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
	});
	const items = feed.data?.pages.flatMap((page) => page.items) ?? [];
	// Later pages can name people the first didn't, so merge every page's map.
	const names = Object.assign(
		{},
		...(feed.data?.pages.map((page) => page.names) ?? []),
	) as Record<string, string>;

	return (
		<SafeAreaView
			edges={["top", "left", "right"]}
			style={{ flex: 1, backgroundColor: t.canvas }}
		>
			<FlatList
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
				data={items}
				keyExtractor={(item) => item.id}
				refreshControl={
					<RefreshControl
						refreshing={feed.isRefetching}
						onRefresh={() => void feed.refetch()}
						tintColor={t.mutedInk}
					/>
				}
				onEndReachedThreshold={0.5}
				onEndReached={() => {
					if (feed.hasNextPage && !feed.isFetchingNextPage)
						void feed.fetchNextPage();
				}}
				ListHeaderComponent={
					<View style={{ gap: 20, paddingTop: 8, paddingBottom: 16 }}>
						<View style={{ minHeight: 48, justifyContent: "center" }}>
							<Wordmark />
						</View>
						<View style={{ gap: 8 }}>
							<Kicker>Across all your groups</Kicker>
							<Display>Activity</Display>
							<Body tone="muted">
								Expenses you’re on, payments to and from you, and changes to
								your membership.
							</Body>
						</View>
					</View>
				}
				renderItem={({ item, index }) => {
					const target =
						item.isMember && item.expenseId
							? () =>
									router.push({
										pathname: "/group/[groupId]/expense/[expenseId]",
										params: {
											groupId: item.organizationId,
											expenseId: item.expenseId ?? "",
										},
									})
							: item.isMember
								? () =>
										router.push({
											pathname: "/group/[groupId]",
											params: { groupId: item.organizationId },
										})
								: undefined;
					return (
						<View
							style={{
								backgroundColor: t.paper,
								borderColor: t.border,
								borderLeftWidth: 1,
								borderRightWidth: 1,
								borderTopWidth: index === 0 ? 1 : 0,
								borderBottomWidth: index === items.length - 1 ? 1 : 0,
								borderTopLeftRadius: index === 0 ? 24 : 0,
								borderTopRightRadius: index === 0 ? 24 : 0,
								borderBottomLeftRadius: index === items.length - 1 ? 24 : 0,
								borderBottomRightRadius: index === items.length - 1 ? 24 : 0,
								paddingHorizontal: 18,
								paddingTop: index === 0 ? 4 : 0,
								paddingBottom: index === items.length - 1 ? 4 : 0,
							}}
						>
							<ActivityRow
								first={index === 0}
								type={item.type}
								sentence={personalSentence(item, viewerId, names)}
								outcome={personalOutcome(item, viewerId)}
								time={formatDateTime(item.createdAt)}
								group={{ id: item.organizationId, name: item.groupName }}
								onPress={target}
							/>
						</View>
					);
				}}
				ListEmptyComponent={
					feed.isPending ? (
						<ActivityIndicator color={t.mutedInk} style={{ marginTop: 24 }} />
					) : feed.isError ? (
						<Card>
							<Body tone="muted">Couldn’t load your activity.</Body>
							<GlassButton
								label="Try again"
								onPress={() => void feed.refetch()}
							/>
						</Card>
					) : (
						<Card>
							<Heading>All caught up</Heading>
							<Body tone="muted">
								When someone adds an expense you’re on or pays you, it shows up
								here.
							</Body>
						</Card>
					)
				}
				ListFooterComponent={
					items.length ? (
						<View style={{ paddingTop: 16 }}>
							{feed.isFetchingNextPage ? (
								<ActivityIndicator color={t.mutedInk} />
							) : feed.isFetchNextPageError ? (
								<GlassButton
									label="Couldn’t load more. Try again"
									onPress={() => void feed.fetchNextPage()}
								/>
							) : null}
						</View>
					) : null
				}
			/>
		</SafeAreaView>
	);
}
