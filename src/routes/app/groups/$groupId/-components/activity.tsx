import { useInfiniteQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { ActivityLine } from "#/components/activity-line";
import { EmptyState } from "#/components/empty-state";
import { HistoryContinuation } from "#/components/history-continuation";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { ItemGroup } from "#/components/ui/item";
import { groupActivityInfiniteOptions } from "#/lib/queries";
import { LoadError, type LoaderData, Loading } from "./shared";

/* ---------------------------------------------------------------- Activity */

export function ActivityTab({
	data,
	groupId,
}: {
	data: LoaderData;
	groupId: string;
}) {
	const activity = useInfiniteQuery(groupActivityInfiniteOptions(groupId));

	const names = new Map(
		data.group.members.map((member) => [member.userId, member.name]),
	);
	const nameOf = (userId: string) => names.get(userId) ?? "someone";
	const items = activity.data?.pages.flatMap((page) => page.items) ?? [];

	if (activity.isPending) return <Loading label="Loading activity…" />;

	if (activity.isError && items.length === 0)
		return (
			<LoadError
				icon={History}
				title="Couldn't load activity"
				query={activity}
			/>
		);

	if (items.length === 0)
		return (
			<EmptyState
				icon={History}
				title="Nothing has happened yet"
				description="Every expense, payment and membership change shows up here."
			/>
		);

	return (
		<Card className="island-shell">
			<CardHeader>
				<CardTitle>Activity</CardTitle>
				<CardDescription>
					Newest changes first.
					{activity.isFetching && !activity.isFetchingNextPage
						? " Updating…"
						: ""}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ItemGroup>
					{items.map((item) => (
						<ActivityLine key={item.id} item={item} nameOf={nameOf} />
					))}
				</ItemGroup>
				<HistoryContinuation query={activity} label="activity" />
			</CardContent>
		</Card>
	);
}
