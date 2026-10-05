import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	HandCoins,
	History,
	Plus,
	Scale,
	Settings,
	UsersRound,
} from "lucide-react";
import { useState } from "react";
import { Amount } from "#/components/amount";
import { AppBreadcrumb } from "#/components/app-breadcrumb";
import { useCommands } from "#/components/command-palette";
import { useComposer } from "#/components/composer";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { useAppMutation } from "#/lib/app-mutation";
import {
	expensesInfiniteOptions,
	groupContextQueryOptions,
	groupSummaryQueryOptions,
} from "#/lib/queries";
import { ActivityTab } from "./-components/activity";
import { BalancesTab } from "./-components/balances";
import { ExpensesTab } from "./-components/expenses";
import { MembersTab } from "./-components/members";
import { SettingsTab } from "./-components/settings";

const TABS = [
	"expenses",
	"balances",
	"members",
	"activity",
	"settings",
] as const;
type GroupTab = (typeof TABS)[number];

export const Route = createFileRoute("/app/groups/$groupId/")({
	/*
	 * The open tab lives in the URL so a reload, a shared link or Back lands on
	 * it. The default stays out of the address; anything unknown falls back to it.
	 */
	validateSearch: (search: Record<string, unknown>): { tab?: GroupTab } => {
		const tab = TABS.find((id) => id === search.tab);
		return tab && tab !== "expenses" ? { tab } : {};
	},
	loader: ({ context, params }) =>
		Promise.all([
			context.queryClient.ensureQueryData(
				groupContextQueryOptions(params.groupId),
			),
			context.queryClient.ensureQueryData(
				groupSummaryQueryOptions(params.groupId),
			),
			// Not awaited for errors: a failed list shows its own "Try again" in
			// the tab, and shouldn't block the rest of the page.
			context.queryClient.prefetchInfiniteQuery(
				expensesInfiniteOptions(params.groupId),
			),
		]),
	component: GroupPage,
});

function GroupPage() {
	const { groupId } = Route.useParams();
	const context = useSuspenseQuery(groupContextQueryOptions(groupId));
	const summary = useSuspenseQuery(groupSummaryQueryOptions(groupId));
	const data = { ...context.data, ...summary.data };
	const isFetching = context.isFetching || summary.isFetching;
	const navigate = useNavigate();
	const composer = useComposer();
	const { run, execute } = useAppMutation();

	const mine = data.balances.members.filter(
		(row) => row.userId === data.user.id,
	);

	const { tab = "expenses" } = Route.useSearch();
	const navigateTab = Route.useNavigate();
	// Replace, not push: flicking through tabs shouldn't fill the Back stack.
	const setTab = (next: string) => {
		const id = TABS.find((value) => value === next) ?? "expenses";
		// The URL already names this tab. Navigating again would re-run the
		// loader and open a second view transition, and the Tabs wrapper only
		// collapses the duplicate fires inside a single click — a request can
		// still land here while an earlier navigation is committing.
		if (id === tab) return;
		void navigateTab({
			search: id === "expenses" ? {} : { tab: id },
			replace: true,
			resetScroll: false,
			// Only the panel changes, and Radix already fades that panel in.
			// Cross-fading the whole page over the top of it reads as a flash.
			viewTransition: false,
		});
	};
	// Bumped by the palette to open "Record payment" on the Balances tab.
	const [settleRequest, setSettleRequest] = useState(0);

	useCommands(data.group.name, [
		{
			id: "group.settle",
			title: "Record a payment",
			icon: HandCoins,
			keywords: ["settle up", "pay back", "repay", "transfer"],
			run: () => {
				setTab("balances");
				setSettleRequest((count) => count + 1);
			},
		},
		{
			id: "group.tab.balances",
			title: "Show balances",
			icon: Scale,
			keywords: ["who owes", "debts", "simplified"],
			run: () => setTab("balances"),
		},
		{
			id: "group.tab.members",
			title: "Show members",
			icon: UsersRound,
			keywords: ["people", "invite", "add member", "guest", "weights"],
			run: () => setTab("members"),
		},
		{
			id: "group.tab.activity",
			title: "Show group activity",
			icon: History,
			keywords: ["history", "log", "changes"],
			run: () => setTab("activity"),
		},
		{
			id: "group.tab.settings",
			title: "Group settings",
			icon: Settings,
			keywords: ["rename", "archive", "leave", "delete", "recurring", "export"],
			run: () => setTab("settings"),
		},
	]);

	return (
		<div className="flex flex-col gap-6 sm:gap-8">
			<AppBreadcrumb
				parent={{ label: "All groups", to: "/app" }}
				page={data.group.name}
			/>
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div className="min-w-0">
					<p className="island-kicker capitalize">{data.group.myRole}</p>
					<h1 className="display-title flex flex-wrap items-center gap-3 text-[2.125rem] sm:text-5xl">
						{data.group.name}
						{isFetching ? (
							<span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
								<Spinner className="size-3" />
								Updating
							</span>
						) : null}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{data.group.members.length}{" "}
						{data.group.members.length === 1 ? "member" : "members"}
						{mine
							.filter((row) => row.balanceMinor !== 0)
							.map((row) => (
								<span key={row.currency}>
									{" · "}
									{row.balanceMinor > 0 ? "you are owed " : "you owe "}
									<Amount
										minor={Math.abs(row.balanceMinor)}
										currency={row.currency}
									/>
								</span>
							))}
					</p>
				</div>
				{/* Duplicated by the tab bar's centre action on a phone. */}
				<Button
					className="hidden sm:inline-flex"
					onClick={() => composer.expense({ groupId })}
				>
					<Plus data-icon="inline-start" />
					Add expense
				</Button>
			</header>

			<Tabs value={tab} onValueChange={setTab}>
				{/*
				 * Five tabs never fit across a phone, so the track scrolls and snaps
				 * instead of squeezing, and `shrink-0` stops the triggers collapsing
				 * to fit. Radix doesn't scroll its own track, so tapping a pill that
				 * is only half on screen pulls it the rest of the way in — otherwise
				 * "Settings" sits permanently clipped at the right edge. Keyboard
				 * users get this free: the browser scrolls whatever it focuses.
				 */}
				<TabsList
					className="segmented rail h-auto w-fit max-w-full justify-start p-1 [&>*]:shrink-0 [&>*]:px-4"
					onClick={(event) =>
						(event.target as HTMLElement)
							.closest('[data-slot="tabs-trigger"]')
							?.scrollIntoView({
								behavior: "smooth",
								inline: "nearest",
								block: "nearest",
							})
					}
				>
					<TabsTrigger value="expenses">Expenses</TabsTrigger>
					<TabsTrigger value="balances">Balances</TabsTrigger>
					<TabsTrigger value="members">Members</TabsTrigger>
					<TabsTrigger value="activity">Activity</TabsTrigger>
					<TabsTrigger value="settings">Settings</TabsTrigger>
				</TabsList>

				<TabsContent value="expenses" className="mt-6 sm:mt-8">
					<ExpensesTab key={groupId} data={data} groupId={groupId} run={run} />
				</TabsContent>
				<TabsContent value="balances" className="mt-6 sm:mt-8">
					<BalancesTab
						data={data}
						groupId={groupId}
						run={run}
						settleRequest={settleRequest}
					/>
				</TabsContent>
				<TabsContent value="members" className="mt-6 sm:mt-8">
					<MembersTab
						data={data}
						groupId={groupId}
						run={run}
						execute={execute}
					/>
				</TabsContent>
				<TabsContent value="activity" className="mt-6 sm:mt-8">
					<ActivityTab data={data} groupId={groupId} />
				</TabsContent>
				<TabsContent value="settings" className="mt-6 sm:mt-8">
					<SettingsTab
						data={data}
						groupId={groupId}
						run={run}
						execute={execute}
						onLeave={() => navigate({ to: "/app" })}
						onSettle={() => {
							setTab("balances");
							setSettleRequest((count) => count + 1);
						}}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
