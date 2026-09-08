import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, Lock, Scale, Users } from "lucide-react";

import { Wordmark } from "#/components/app-shell";
import { ThemeToggle } from "#/components/theme";
import { Alert, AlertDescription } from "#/components/ui/alert";
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
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "#/components/ui/item";
import { Separator } from "#/components/ui/separator";
import { getSessionFn } from "#/server/fn/auth";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		if (await getSessionFn()) throw redirect({ to: "/app" });
	},
	component: Home,
});

const features = [
	{
		icon: Users,
		title: "Groups stay private",
		text: "Only invited members can see a group's expenses, balances and history.",
	},
	{
		icon: Lock,
		title: "Locked once it's paid",
		text: "The moment someone marks their share paid, the expense stops changing under them.",
	},
	{
		icon: Scale,
		title: "No rounding drift",
		text: "Every split is computed in paise, so shares always add up to the total exactly.",
	},
];

/** Illustrative figures for the landing preview — not real data. */
const sampleRows = [
	{ name: "Beach shack dinner", who: "Priya paid", amount: "₹3,600" },
	{ name: "Scooter rental", who: "Arjun paid", amount: "₹1,800" },
	{ name: "Villa groceries", who: "You paid", amount: "₹2,450" },
];

function Home() {
	return (
		<div className="flex min-h-screen flex-col">
			<header className="page-wrap flex h-20 items-center justify-between">
				<Wordmark />
				<div className="flex items-center gap-2">
					<ThemeToggle />
					<Button variant="ghost" asChild>
						<Link to="/login">Log in</Link>
					</Button>
					<Button asChild>
						<Link to="/signup">Get started</Link>
					</Button>
				</div>
			</header>

			<main className="page-wrap flex-1">
				<section className="grid items-center gap-12 py-12 lg:grid-cols-[1.1fr_.9fr] lg:py-20">
					<div className="rise-in">
						<p className="island-kicker">Fair down to the last paise</p>
						<h1 className="display-title mt-4 text-5xl leading-[1.05] font-bold md:text-6xl">
							Shared spending, minus the awkward maths.
						</h1>
						<p className="mt-6 max-w-xl text-lg text-muted-foreground">
							Split every dinner, trip and chai run four different ways. Exact
							integer maths, clear balances, and a payment trail everyone can
							trust.
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
							<Button size="lg" asChild>
								<Link to="/signup">
									Create your first group
									<ArrowRight data-icon="inline-end" />
								</Link>
							</Button>
							<Button size="lg" variant="outline" asChild>
								<Link to="/login">I have an account</Link>
							</Button>
						</div>
						<p className="mt-4 text-sm text-muted-foreground">
							Even · Exact · Shares · Percent — all in rupees.
						</p>
					</div>

					<Card className="island-shell rise-in rounded-3xl">
						<CardHeader>
							<div className="flex items-start justify-between gap-3">
								<div>
									<CardDescription>Goa weekend</CardDescription>
									<CardTitle className="display-title text-3xl font-bold">
										You are owed{" "}
										<span className="tabular text-positive">₹2,440</span>
									</CardTitle>
								</div>
								<Badge variant="secondary">3 members</Badge>
							</div>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<ItemGroup>
								{sampleRows.map((row) => (
									<Item key={row.name} size="sm">
										<ItemContent>
											<ItemTitle>{row.name}</ItemTitle>
											<ItemDescription>{row.who}</ItemDescription>
										</ItemContent>
										<strong className="tabular shrink-0">{row.amount}</strong>
									</Item>
								))}
							</ItemGroup>
							<Alert className="border-positive/30 bg-positive/10 text-positive">
								<AlertDescription>
									Arjun pays you ₹2,440 to settle up
								</AlertDescription>
							</Alert>
						</CardContent>
					</Card>
				</section>

				<section className="grid gap-4 pb-16 md:grid-cols-3">
					{features.map(({ icon: Icon, title, text }) => (
						<Card key={title} className="feature-card">
							<CardHeader>
								<div className="mb-2 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
									<Icon className="size-5" aria-hidden="true" />
								</div>
								<CardTitle>{title}</CardTitle>
								<CardDescription>{text}</CardDescription>
							</CardHeader>
						</Card>
					))}
				</section>
			</main>

			<footer className="page-wrap py-8 text-xs text-muted-foreground">
				<Separator className="mb-8" />
				EvenTual · expenses without the spreadsheet.
			</footer>
		</div>
	);
}
