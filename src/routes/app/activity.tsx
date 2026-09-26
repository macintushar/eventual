import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { AppBreadcrumb } from "#/components/app-breadcrumb";
import { EmptyState } from "#/components/empty-state";
import { PersonalActivityRow } from "#/components/personal-activity";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { myActivityInfiniteOptions } from "#/lib/queries";

export const Route = createFileRoute("/app/activity")({
	head: () => ({ meta: [{ title: "Activity · Eventual" }] }),
	loader: ({ context }) =>
		context.queryClient.ensureInfiniteQueryData(myActivityInfiniteOptions),
	component: ActivityPage,
});

function ActivityPage() {
	const { user } = Route.useRouteContext();
	const activity = useInfiniteQuery(myActivityInfiniteOptions);
	const items = activity.data?.pages.flatMap((page) => page.items) ?? [];
	const names = Object.assign(
		{},
		...(activity.data?.pages.map((page) => page.names) ?? []),
	);

	useEffect(() => {
		if (!activity.isFetchNextPageError) return;
		toast.error(
			activity.error instanceof Error
				? activity.error.message
				: "Could not load activity",
		);
	}, [activity.isFetchNextPageError, activity.error]);

	return (
		<div className="col-form flex flex-col gap-6">
			<AppBreadcrumb
				parent={{ label: "All groups", to: "/app" }}
				page="Activity"
			/>
			<div>
				<p className="island-kicker">Across all your groups</p>
				<h1 className="display-title mt-2 flex flex-wrap items-center gap-3 text-3xl font-bold sm:text-4xl">
					Activity
					{activity.isFetching && !activity.isFetchingNextPage ? (
						<span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
							<Spinner className="size-3" />
							Updating
						</span>
					) : null}
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Expenses you're on, payments to and from you, and changes to your
					membership.
				</p>
			</div>

			{activity.isPending ? (
				<p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
					<Spinner />
					Loading activity…
				</p>
			) : activity.isError && items.length === 0 ? (
				<EmptyState
					icon={History}
					title="Activity didn't load"
					description={
						activity.error instanceof Error
							? activity.error.message
							: "Could not load activity."
					}
					action={
						<Button variant="outline" onClick={() => void activity.refetch()}>
							Try again
						</Button>
					}
				/>
			) : items.length === 0 ? (
				<EmptyState
					icon={History}
					title="Nothing involving you yet"
					description="When someone adds you to an expense, pays you back or adds you to a group, it shows up here."
				/>
			) : (
				<section className="island-shell rounded-3xl p-2 sm:p-3">
					<ol className="flex flex-col divide-y divide-border/70">
						{items.map((item) => (
							<li key={item.id} className="py-0.5">
								<PersonalActivityRow
									item={item}
									viewerId={user.id}
									names={names}
								/>
							</li>
						))}
					</ol>
					{activity.hasNextPage ? (
						<Button
							variant="outline"
							className="m-2 w-[calc(100%-1rem)]"
							disabled={activity.isFetchingNextPage}
							onClick={() => {
								void activity.fetchNextPage();
							}}
						>
							{activity.isFetchingNextPage ? (
								<Spinner data-icon="inline-start" />
							) : null}
							{activity.isFetchingNextPage ? "Loading…" : "Load more"}
						</Button>
					) : null}
				</section>
			)}
		</div>
	);
}
