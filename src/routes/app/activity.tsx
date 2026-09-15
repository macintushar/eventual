import { createFileRoute } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppBreadcrumb } from "#/components/app-breadcrumb";
import { EmptyState } from "#/components/empty-state";
import { PersonalActivityRow } from "#/components/personal-activity";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { getMyActivityFn } from "#/server/fn/app";

export const Route = createFileRoute("/app/activity")({
	head: () => ({ meta: [{ title: "Activity · Eventual" }] }),
	loader: () => getMyActivityFn({ data: {} }),
	component: ActivityPage,
});

function ActivityPage() {
	const initial = Route.useLoaderData();
	const { user } = Route.useRouteContext();
	const [items, setItems] = useState(initial.items);
	const [names, setNames] = useState(initial.names);
	const [cursor, setCursor] = useState(initial.nextCursor);
	const [loading, setLoading] = useState(false);

	const loadMore = async () => {
		if (!cursor) return;
		setLoading(true);
		try {
			const next = await getMyActivityFn({ data: { cursor } });
			setItems((old) => [...old, ...next.items]);
			setNames((old) => ({ ...old, ...next.names }));
			setCursor(next.nextCursor);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not load activity",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="col-form flex flex-col gap-6">
			<AppBreadcrumb
				parent={{ label: "All groups", to: "/app" }}
				page="Activity"
			/>
			<div>
				<p className="island-kicker">Across all your groups</p>
				<h1 className="display-title mt-2 text-3xl font-bold sm:text-4xl">
					Activity
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Expenses you're on, payments to and from you, and changes to your
					membership.
				</p>
			</div>

			{items.length === 0 ? (
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
					{cursor ? (
						<Button
							variant="outline"
							className="m-2 w-[calc(100%-1rem)]"
							disabled={loading}
							onClick={loadMore}
						>
							{loading ? <Spinner data-icon="inline-start" /> : null}
							{loading ? "Loading…" : "Load more"}
						</Button>
					) : null}
				</section>
			)}
		</div>
	);
}
