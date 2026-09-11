import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, Lock, Scale, Users } from "lucide-react";

import { Wordmark } from "#/components/app-shell";
import {
	assistantBrands,
	type Brand,
	BrandLogo,
} from "#/components/brand-logo";
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
	head: () => ({
		meta: [
			{ title: "EvenTual · Split group expenses in rupees, to the last paisa" },
			{
				name: "description",
				content:
					"Log what everyone paid on trips, in flats and on nights out. EvenTual splits it evenly or any way you like and tells each person exactly what they owe.",
			},
		],
	}),
	beforeLoad: async () => {
		if (await getSessionFn()) throw redirect({ to: "/app" });
	},
	component: Home,
});

const features = [
	{
		icon: Users,
		title: "Only your group sees it",
		text: "Expenses, balances and history are visible to invited members. Nobody else.",
	},
	{
		icon: Lock,
		title: "Paid means paid",
		text: "Once someone marks their share paid, the expense locks. The amount they settled can't quietly change afterwards.",
	},
	{
		icon: Scale,
		title: "Shares that add up",
		text: "₹1,000 split three ways is ₹333.34, ₹333.33 and ₹333.33. Never ₹999.99, never an argument.",
	},
];

const integrations: {
	logos: Brand[];
	title: string;
	text: string;
	hash: string;
}[] = [
	{
		logos: ["shortcuts"],
		title: "Log it before you forget",
		text: "Run the Apple Shortcut from your iPhone, Watch or Siri. Pick the group, who paid and the amount. It splits evenly, and you can fine-tune it later.",
		hash: "shortcut",
	},
	{
		logos: assistantBrands,
		title: "Or just tell your AI assistant",
		text: "“Priya paid ₹3,600 for dinner, split it evenly.” Works with Claude, Cursor, OpenCode, Hermes and OpenClaw.",
		hash: "mcp",
	},
];

/**
 * Illustrative figures for the landing preview — not real data. They must add
 * up: ₹11,760 split three ways is ₹3,920 each, so you're owed ₹2,440.
 */
const sampleRows = [
	{ name: "Beach shack dinner", who: "Priya paid", amount: "₹3,600" },
	{ name: "Scooter rental", who: "Arjun paid", amount: "₹1,800" },
	{ name: "Villa booking", who: "You paid", amount: "₹6,360" },
];

function Home() {
	return (
		<div className="flex min-h-screen flex-col">
			<header className="page-wrap flex h-20 items-center justify-between">
				<Wordmark />
				<div className="flex items-center gap-2">
					<ThemeToggle />
					<Button variant="ghost" className="hidden sm:inline-flex" asChild>
						<Link to="/docs">Integrations</Link>
					</Button>
					<Button variant="ghost" asChild>
						<Link to="/login">Log in</Link>
					</Button>
					<Button asChild>
						<Link to="/signup">Start a group</Link>
					</Button>
				</div>
			</header>

			<main className="page-wrap flex-1">
				<section className="grid items-center gap-12 py-12 lg:grid-cols-[1.1fr_.9fr] lg:py-20">
					<div className="rise-in">
						<p className="island-kicker">For trips, flats and every chai run</p>
						<h1 className="display-title mt-4 text-5xl leading-[1.05] font-bold md:text-6xl">
							Settle up without the group-chat maths.
						</h1>
						<p className="mt-6 max-w-xl text-lg text-muted-foreground">
							Log what everyone paid. EvenTual splits it and tells each person
							exactly who to pay and how much, down to the last paisa.
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
							<Button size="lg" asChild>
								<Link to="/signup">
									Create your first group
									<ArrowRight data-icon="inline-end" />
								</Link>
							</Button>
							<Button size="lg" variant="outline" asChild>
								<Link to="/login">Log in</Link>
							</Button>
						</div>
						<p className="mt-4 text-sm text-muted-foreground">
							Split evenly, by exact amounts, by shares or by percent.
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
									Arjun pays you ₹2,120 and Priya pays you ₹320. Then you're all
									square.
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

				<section className="grid gap-4 pb-16 md:grid-cols-2">
					{integrations.map(({ logos, title, text, hash }) => (
						<Link key={title} to="/docs" hash={hash} className="no-underline">
							<Card className="feature-card h-full">
								<CardHeader>
									<div className="mb-2 flex items-center gap-2">
										{logos.map((brand) => (
											<div
												key={brand}
												className="grid size-10 place-items-center rounded-xl border bg-background/70"
											>
												<BrandLogo
													brand={brand}
													className={
														brand === "shortcuts" ? "size-8" : "size-5"
													}
												/>
											</div>
										))}
									</div>
									<CardTitle className="flex items-center gap-2">
										{title}
										<ArrowRight className="size-4" aria-hidden="true" />
									</CardTitle>
									<CardDescription>{text}</CardDescription>
								</CardHeader>
							</Card>
						</Link>
					))}
				</section>

				<section className="island-shell mb-16 flex flex-col items-start gap-4 rounded-3xl border p-8 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 className="display-title text-3xl font-bold">
							Planning a trip? Start the group before the first bill.
						</h2>
						<p className="mt-2 text-muted-foreground">
							Invite everyone, log costs as they happen, and settle up once when
							you're back.
						</p>
					</div>
					<Button size="lg" asChild>
						<Link to="/signup">
							Create your first group
							<ArrowRight data-icon="inline-end" />
						</Link>
					</Button>
				</section>
			</main>

			<footer className="page-wrap py-8 text-xs text-muted-foreground">
				<Separator className="mb-8" />
				EvenTual · split it fairly, settle it once.
			</footer>
		</div>
	);
}
