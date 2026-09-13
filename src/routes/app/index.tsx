import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mail, Plus, Users } from "lucide-react";

import { Amount } from "#/components/amount";
import { useComposer } from "#/components/composer";
import { EmptyState } from "#/components/empty-state";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemGroup,
	ItemTitle,
} from "#/components/ui/item";
import { getDashboardFn } from "#/server/fn/app";

export const Route = createFileRoute("/app/")({
	loader: () => getDashboardFn(),
	component: Dashboard,
});

function Dashboard() {
	const { groups, invitations, user } = Route.useLoaderData();
	const composer = useComposer();
	const balances = groups.flatMap((group) => group.balances);
	const totals = [...new Set(balances.map((row) => row.currency))]
		.sort()
		.map((currency) => ({
			currency,
			owed: balances
				.filter((row) => row.currency === currency)
				.reduce((sum, row) => sum + Math.max(row.balanceMinor, 0), 0),
			owing: balances
				.filter((row) => row.currency === currency)
				.reduce((sum, row) => sum + Math.max(-row.balanceMinor, 0), 0),
		}));

	return (
		<div className="flex flex-col gap-6 sm:gap-8">
			<Card className="island-shell rise-in overflow-hidden rounded-3xl py-0">
				<CardContent className="grid gap-5 p-5 sm:gap-6 sm:p-7 md:grid-cols-[1.4fr_1fr] md:items-center">
					<div>
						<p className="island-kicker">Your running total</p>
						<h1 className="display-title mt-2 text-[2.125rem] font-bold sm:text-5xl">
							{balances.every((row) => row.balanceMinor === 0)
								? "You're all square"
								: "Your balances"}
						</h1>
						<p className="mt-2 text-sm text-muted-foreground sm:text-base">
							Welcome back, {user.name.split(" ")[0]}. Across{" "}
							{groups.length === 1 ? "1 group" : `${groups.length} groups`}.
						</p>
					</div>
					<dl className="grid grid-cols-2 gap-3">
						<Card className="py-0">
							<CardHeader className="gap-1 p-4">
								<CardDescription>Owed to you</CardDescription>
								<CardTitle className="text-xl">
									{totals.length
										? totals.map((row) => (
												<Amount
													key={row.currency}
													minor={row.owed}
													currency={row.currency}
													className="block text-positive"
												/>
											))
										: "—"}
								</CardTitle>
							</CardHeader>
						</Card>
						<Card className="py-0">
							<CardHeader className="gap-1 p-4">
								<CardDescription>You owe</CardDescription>
								<CardTitle className="text-xl">
									{totals.length
										? totals.map((row) => (
												<Amount
													key={row.currency}
													minor={row.owing}
													currency={row.currency}
													className="block text-negative"
												/>
											))
										: "—"}
								</CardTitle>
							</CardHeader>
						</Card>
					</dl>
				</CardContent>
			</Card>

			{invitations.length > 0 && (
				<section aria-labelledby="invites-heading">
					<h2
						id="invites-heading"
						className="mb-3 flex items-center gap-2 text-lg font-semibold"
					>
						<Mail className="size-4 text-primary" aria-hidden="true" />
						Pending invitations
					</h2>
					<ItemGroup className="gap-2">
						{invitations.map((row, index) => (
							<Item
								key={row.invitation.id}
								variant="outline"
								className="rise-in border-primary/30 bg-primary/5"
								style={{ "--i": index } as React.CSSProperties}
							>
								<ItemContent>
									<ItemTitle className="text-wrap">
										{row.inviterName} invited you to {row.groupName}
									</ItemTitle>
								</ItemContent>
								<ItemActions>
									<Button size="sm" className="press" asChild>
										<Link
											to="/invite/$invitationId"
											params={{ invitationId: row.invitation.id }}
										>
											Review
										</Link>
									</Button>
								</ItemActions>
							</Item>
						))}
					</ItemGroup>
				</section>
			)}

			<section aria-labelledby="groups-heading">
				<div className="mb-3 flex flex-wrap items-end justify-between gap-3 sm:mb-4">
					<div>
						<h2
							id="groups-heading"
							className="text-xl font-semibold sm:text-2xl"
						>
							Groups
						</h2>
						<p className="text-sm text-muted-foreground">
							Every shared tab in one place.
						</p>
					</div>
					{/* On a phone the tab bar's centre action already creates groups,
					    so this duplicate only shows once there's room for it. */}
					<Button
						className="hidden sm:inline-flex"
						onClick={() => composer.group()}
					>
						<Plus data-icon="inline-start" />
						New group
					</Button>
				</div>
				{groups.length ? (
					<ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
						{groups.map((group, index) => {
							const outstanding = group.balances.filter(
								(row) => row.balanceMinor !== 0,
							);
							return (
								<li key={group.id}>
									{/*
									 * One card, two shapes: a dense row on a phone, where a
									 * name and a number is all that fits, and the full stacked
									 * article card once the grid has columns to fill.
									 */}
									<Link
										to="/app/groups/$groupId"
										params={{ groupId: group.id }}
										className="feature-card press rise-in flex h-full items-center gap-4 rounded-2xl p-4 no-underline sm:flex-col sm:items-stretch sm:gap-4 sm:p-6"
										style={{ "--i": index } as React.CSSProperties}
									>
										<div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-none sm:gap-2">
											<div className="flex items-center gap-2">
												<Badge variant="secondary" className="capitalize">
													{group.role}
												</Badge>
												<ArrowRight
													className="hidden size-4 text-muted-foreground sm:ml-auto sm:block"
													aria-hidden="true"
												/>
											</div>
											<h3 className="display-title truncate text-xl font-bold">
												{group.name}
											</h3>
										</div>
										<div className="shrink-0 text-right sm:text-left">
											{outstanding.length ? (
												outstanding.map((row) => (
													<div key={row.currency}>
														<p className="text-xl font-bold sm:text-2xl">
															<Amount
																minor={row.balanceMinor}
																currency={row.currency}
																tone="signed"
															/>
														</p>
														<p className="text-xs text-muted-foreground sm:text-sm">
															{row.balanceMinor > 0 ? "Owed to you" : "You owe"}
														</p>
													</div>
												))
											) : (
												<p className="text-sm text-muted-foreground">
													Settled up
												</p>
											)}
										</div>
									</Link>
								</li>
							);
						})}
					</ul>
				) : (
					<EmptyState
						icon={Users}
						title="No groups yet"
						description="Create one for your flat, a dinner, or the next trip — then invite people with a link."
						action={
							<Button onClick={() => composer.group()}>
								<Plus data-icon="inline-start" />
								New group
							</Button>
						}
					/>
				)}
			</section>
		</div>
	);
}
