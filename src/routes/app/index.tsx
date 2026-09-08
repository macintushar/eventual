import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mail, Plus, Users } from "lucide-react";

import { Amount } from "#/components/amount";
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
import { formatMinor } from "#/lib/money";
import { getDashboardFn } from "#/server/fn/app";

export const Route = createFileRoute("/app/")({
	loader: () => getDashboardFn(),
	component: Dashboard,
});

function Dashboard() {
	const { groups, invitations, user } = Route.useLoaderData();
	const total = groups.reduce((sum, group) => sum + group.balanceMinor, 0);
	const owed = groups.reduce(
		(sum, group) => sum + Math.max(group.balanceMinor, 0),
		0,
	);
	const owing = groups.reduce(
		(sum, group) => sum + Math.min(group.balanceMinor, 0),
		0,
	);

	return (
		<div className="flex flex-col gap-8">
			<Card className="island-shell rise-in overflow-hidden rounded-3xl">
				<CardContent className="grid gap-6 p-7 md:grid-cols-[1.4fr_1fr] md:items-center">
					<div>
						<p className="island-kicker">Your running total</p>
						<h1 className="display-title mt-2 text-4xl font-bold sm:text-5xl">
							{total === 0
								? "You're all square"
								: total > 0
									? "You are owed"
									: "You owe"}{" "}
							{total !== 0 && (
								<span className={total > 0 ? "text-positive" : "text-negative"}>
									<span className="tabular">
										{formatMinor(Math.abs(total))}
									</span>
								</span>
							)}
						</h1>
						<p className="mt-2 text-muted-foreground">
							Welcome back, {user.name.split(" ")[0]}. Across{" "}
							{groups.length === 1 ? "1 group" : `${groups.length} groups`}.
						</p>
					</div>
					<dl className="grid grid-cols-2 gap-3">
						<Card>
							<CardHeader className="p-4">
								<CardDescription>Owed to you</CardDescription>
								<CardTitle className="text-xl">
									<Amount minor={owed} className="text-positive" />
								</CardTitle>
							</CardHeader>
						</Card>
						<Card>
							<CardHeader className="p-4">
								<CardDescription>You owe</CardDescription>
								<CardTitle className="text-xl">
									<Amount
										minor={Math.abs(owing)}
										className={owing < 0 ? "text-negative" : ""}
									/>
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
						{invitations.map((row) => (
							<Item
								key={row.invitation.id}
								variant="outline"
								className="border-primary/30 bg-primary/5"
							>
								<ItemContent>
									<ItemTitle>
										{row.inviterName} invited you to {row.groupName}
									</ItemTitle>
								</ItemContent>
								<ItemActions>
									<Button size="sm" asChild>
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
				<div className="mb-4 flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 id="groups-heading" className="text-2xl font-semibold">
							Groups
						</h2>
						<p className="text-sm text-muted-foreground">
							Every shared tab in one place.
						</p>
					</div>
					<Button asChild>
						<Link to="/app/groups/new">
							<Plus data-icon="inline-start" />
							New group
						</Link>
					</Button>
				</div>
				{groups.length ? (
					<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{groups.map((group) => (
							<li key={group.id}>
								<Link
									to="/app/groups/$groupId"
									params={{ groupId: group.id }}
									className="block h-full no-underline"
								>
									<Card className="feature-card h-full">
										<CardHeader>
											<div className="flex items-start justify-between gap-2">
												<Badge variant="secondary" className="capitalize">
													{group.role}
												</Badge>
												<ArrowRight
													className="size-4 text-muted-foreground"
													aria-hidden="true"
												/>
											</div>
											<CardTitle className="display-title text-xl font-bold">
												{group.name}
											</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-2xl font-bold">
												<Amount minor={group.balanceMinor} tone="signed" />
											</p>
											<CardDescription>
												{group.balanceMinor === 0
													? "Settled up"
													: group.balanceMinor > 0
														? "Owed to you"
														: "You owe"}
											</CardDescription>
										</CardContent>
									</Card>
								</Link>
							</li>
						))}
					</ul>
				) : (
					<EmptyState
						icon={Users}
						title="No groups yet"
						description="Create one for your flat, a dinner, or the next trip — then invite people with a link."
						action={
							<Button asChild>
								<Link to="/app/groups/new">
									<Plus data-icon="inline-start" />
									New group
								</Link>
							</Button>
						}
					/>
				)}
			</section>
		</div>
	);
}
