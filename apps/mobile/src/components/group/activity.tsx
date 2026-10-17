import { useInfiniteQuery } from "@tanstack/react-query";
import { groupSentence, relativeTime } from "../../lib/activity";
import { useGroupContext } from "../../lib/queries";
import { useApi } from "../../lib/session";
import { ActivityRow } from "../activity-row";
import { Body, Card, GlassButton } from "../brand";

/** Everything that happened in the group, newest first. */
export function ActivityTab({ groupId }: { groupId: string }) {
	const api = useApi();
	const context = useGroupContext(groupId);
	const feed = useInfiniteQuery({
		queryKey: ["group", groupId, "activity"],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			api.call(
				"activity.group",
				{ groupId, cursor: pageParam, limit: 30 },
				{ signal },
			),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
	});
	const items = feed.data?.pages.flatMap((page) => page.items) ?? [];
	const members = context.data?.group.members ?? [];
	const nameOf = (userId: string) =>
		members.find((member) => member.userId === userId)?.name ??
		"a former member";

	return (
		<Card style={{ gap: 0, paddingVertical: 8 }}>
			{feed.isPending ? (
				<Body tone="muted" style={{ paddingVertical: 14 }}>
					Loading activity…
				</Body>
			) : feed.isError && items.length === 0 ? (
				<>
					<Body tone="muted" style={{ paddingVertical: 14 }}>
						Couldn’t load activity.
					</Body>
					<GlassButton label="Try again" onPress={() => void feed.refetch()} />
				</>
			) : items.length === 0 ? (
				<Body tone="muted" style={{ paddingVertical: 14 }}>
					Nothing has happened here yet.
				</Body>
			) : (
				items.map((item, index) => (
					<ActivityRow
						key={item.id}
						first={index === 0}
						type={item.type}
						sentence={groupSentence(item, nameOf)}
						time={relativeTime(item.createdAt)}
					/>
				))
			)}
			{feed.hasNextPage ? (
				<GlassButton
					label={feed.isFetchingNextPage ? "Loading…" : "Show older activity"}
					busy={feed.isFetchingNextPage}
					onPress={() => void feed.fetchNextPage()}
				/>
			) : null}
		</Card>
	);
}
