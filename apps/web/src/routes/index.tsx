import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe, Lock, Scale, Users } from "lucide-react";
import { useEffect } from "react";

import {
	assistantBrands,
	type Brand,
	BrandLogo,
} from "#/components/brand-logo";
import { SOURCE_URL } from "#/components/legal-page";
import {
	PublicFooter,
	PublicPage,
	publicSiteActions,
} from "#/components/public-header";
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
import { useClientUser } from "#/lib/session";
import { SITE_URL } from "#/lib/site";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{
				title: "Eventual · Split group expenses in rupees, to the last paisa",
			},
			{
				name: "description",
				content:
					"Log what everyone paid on trips, in flats and on nights out. Eventual splits it evenly or any way you like and tells each person exactly what they owe. On the web, iPhone and Android, with an API, SDK and MCP server.",
			},
			{
				property: "og:title",
				content: "Eventual · Split group expenses in rupees, to the last paisa",
			},
			{
				property: "og:description",
				content:
					"Log what everyone paid on trips, in flats and on nights out. Eventual splits it evenly or any way you like and tells each person exactly what they owe. On the web, iPhone and Android, with an API, SDK and MCP server.",
			},
			{
				property: "og:type",
				content: "website",
			},
			{
				property: "og:url",
				content: SITE_URL,
			},
			{
				property: "og:site_name",
				content: "Eventual",
			},
			{
				name: "twitter:card",
				content: "summary",
			},
		],
		links: [
			{
				rel: "canonical",
				href: SITE_URL,
			},
		],
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@graph": [
						{
							"@type": "Organization",
							"@id": `${SITE_URL}/#organization`,
							name: "Eventual",
							url: SITE_URL,
							logo: `${SITE_URL}/logo.svg`,
							sameAs: [SOURCE_URL],
						},
						{
							"@type": "WebSite",
							"@id": `${SITE_URL}/#website`,
							name: "Eventual",
							url: SITE_URL,
							publisher: { "@id": `${SITE_URL}/#organization` },
						},
						{
							"@type": "SoftwareApplication",
							"@id": `${SITE_URL}/#app`,
							name: "Eventual",
							alternateName: "Eventual expense splitter",
							disambiguatingDescription:
								"Open-source app for splitting group expenses in Indian rupees and other currencies.",
							description:
								"Split group expenses in rupees. Log what everyone paid on trips, flats and nights out, split evenly or any way you like, and settle up exactly.",
							url: SITE_URL,
							applicationCategory: "FinanceApplication",
							// The native app is built from source, not listed in a store,
							// so there's deliberately no downloadUrl or MobileApplication.
							operatingSystem: "Web, iOS, Android",
							isAccessibleForFree: true,
							publisher: { "@id": `${SITE_URL}/#organization` },
							offers: {
								"@type": "Offer",
								price: "0",
								priceCurrency: "INR",
							},
						},
						{
							"@type": "SoftwareSourceCode",
							name: "Eventual",
							codeRepository: SOURCE_URL,
							programmingLanguage: "TypeScript",
							targetProduct: { "@id": `${SITE_URL}/#app` },
						},
					],
				}),
			},
		],
	}),
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

/**
 * One account, three ways in. The native app isn't in the stores yet, so its
 * card says so and points at the source instead of a store badge.
 */
const platforms: {
	title: string;
	kicker: string;
	text: string;
	link:
		| { label: string; to: "/signup" | "/docs"; hash?: string }
		| { label: string; href: string };
	logos?: Brand[];
}[] = [
	{
		kicker: "Web",
		title: "Open it in any browser",
		text: "The full app on your laptop or phone. Nothing to install, and it's where invites land.",
		link: { label: "Start a group", to: "/signup" },
	},
	{
		kicker: "iPhone & Android",
		logos: ["apple", "android"],
		title: "A native app in your pocket",
		text: "Native tabs and sheets, UPI handoff when you settle up, and it won't lose the expense you're typing if the network drops. Not in the App Store or Play Store yet. Build it from source and point it at any Eventual server.",
		link: {
			label: "Build the app",
			href: `${SOURCE_URL}/tree/main/apps/mobile`,
		},
	},
	{
		kicker: "Developers",
		logos: ["typescript"],
		title: "Build on the same API",
		text: "A typed TypeScript SDK, a REST API with an OpenAPI 3.1 spec, and an MCP server. The web and mobile apps use the same endpoints.",
		link: { label: "SDK and API docs", to: "/docs", hash: "sdk" },
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
		text: "Run the Apple Shortcut from your Action Button, Watch or Siri and type an amount, or hand it a bank SMS. It splits evenly, and you can fine-tune it later.",
		hash: "shortcut",
	},
	{
		logos: assistantBrands,
		title: "Or just tell your AI assistant",
		text: "“Mac paid ₹3,600 for dinner, split it evenly.” Works with Claude, ChatGPT, Cursor and any other app that supports MCP.",
		hash: "mcp",
	},
];

/**
 * Illustrative figures for the landing preview — not real data. They must add
 * up: ₹11,760 split three ways is ₹3,920 each, so you're owed ₹2,440.
 */
const sampleRows = [
	{ name: "Beach shack dinner", who: "Mac paid", amount: "₹3,600" },
	{ name: "Scooter rental", who: "Arjun paid", amount: "₹1,800" },
	{ name: "Villa booking", who: "You paid", amount: "₹6,360" },
];

function Home() {
	const navigate = Route.useNavigate();

	const user = useClientUser();
	useEffect(() => {
		if (user) void navigate({ to: "/app" });
	}, [navigate, user]);

	return (
		<PublicPage
			actions={publicSiteActions(false)}
			footer={
				<PublicFooter tagline="Eventual · split it fairly, settle it once." />
			}
		>
			<section className="grid items-center gap-8 py-8 sm:gap-12 sm:py-12 lg:grid-cols-[1.1fr_.9fr] lg:py-20">
				<div className="rise-in">
					<p className="island-kicker">
						Split expenses for trips, flats and every chai run
					</p>
					<h1 className="display-title mt-4 text-[2.5rem] leading-[1.05] font-bold sm:text-5xl md:text-6xl">
						Settle up without the group-chat maths.
					</h1>
					<p className="mt-5 max-w-xl text-base text-muted-foreground sm:mt-6 sm:text-lg">
						Log what everyone paid. Eventual splits the bill and tells each
						person exactly who to pay and how much, down to the last paisa.
					</p>
					<div className="mt-7 flex flex-wrap gap-3">
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
						Split evenly, by exact amounts, by shares or by percent. On the web,
						iPhone and Android.
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
								Arjun pays you ₹2,120 and Mac pays you ₹320. Then you're all
								square.
							</AlertDescription>
						</Alert>
					</CardContent>
				</Card>
			</section>

			<section className="grid gap-3 pb-12 sm:gap-4 sm:pb-16 md:grid-cols-3">
				{features.map(({ icon: Icon, title, text }) => (
					<Card key={title} className="feature-card">
						<CardHeader>
							<div className="mb-2 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
								<Icon className="size-5" aria-hidden="true" />
							</div>
							{/* Real h2: search engines see a proper outline, the
							    classes keep the CardTitle look */}
							<h2 className="leading-none font-semibold">{title}</h2>

							<CardDescription>{text}</CardDescription>
						</CardHeader>
					</Card>
				))}
			</section>

			<section className="flex flex-col gap-4 pb-12 sm:gap-6 sm:pb-16">
				<div className="max-w-2xl">
					<p className="island-kicker">One account, everywhere</p>
					<h2 className="display-title mt-3 text-[1.75rem] leading-tight font-bold sm:text-3xl">
						Web, iPhone, Android, or your own code.
					</h2>
					<p className="mt-2 text-muted-foreground">
						Every app talks to the same API, so an expense logged on one shows
						up on all the others.
					</p>
				</div>
				<div className="grid gap-3 sm:gap-4 md:grid-cols-3">
					{platforms.map(({ kicker, logos, title, text, link }) => (
						<Card key={title} className="feature-card h-full">
							<CardHeader className="flex h-full flex-col">
								<div className="mb-2 flex items-center gap-2">
									{logos ? (
										logos.map((brand) => (
											<div
												key={brand}
												className="grid size-10 place-items-center rounded-xl border bg-background/70"
											>
												<BrandLogo brand={brand} className="size-5" />
											</div>
										))
									) : (
										<div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
											<Globe className="size-5" aria-hidden="true" />
										</div>
									)}
								</div>
								<p className="text-xs font-medium text-muted-foreground">
									{kicker}
								</p>
								<h3 className="leading-none font-semibold">{title}</h3>
								<CardDescription className="flex-1">{text}</CardDescription>
								<Button
									variant="link"
									className="mt-2 h-auto w-fit px-0"
									asChild
								>
									{"to" in link ? (
										<Link to={link.to} hash={link.hash}>
											{link.label}
											<ArrowRight data-icon="inline-end" />
										</Link>
									) : (
										<a href={link.href} target="_blank" rel="noreferrer">
											{link.label}
											<ArrowRight data-icon="inline-end" />
										</a>
									)}
								</Button>
							</CardHeader>
						</Card>
					))}
				</div>
			</section>

			<section className="grid gap-3 pb-12 sm:gap-4 sm:pb-16 md:grid-cols-2">
				{integrations.map(({ logos, title, text, hash }) => (
					<Link key={title} to="/docs" hash={hash} className="no-underline">
						<Card className="feature-card h-full">
							<CardHeader>
								<div className="mb-2 flex items-center gap-2">
									{logos.map((brand) => (
										<div
											key={brand}
											className={cn(
												"grid size-10 place-items-center rounded-xl border bg-background/70",
												brand === "shortcuts" && "bg-transparent border-0",
											)}
										>
											<BrandLogo
												brand={brand}
												className={cn(
													"size-5",
													brand === "shortcuts" &&
														"size-10 object-cover rounded-full",
												)}
											/>
										</div>
									))}
								</div>
								<h2 className="flex items-center gap-2 font-semibold">
									{title}
									<ArrowRight className="size-4" aria-hidden="true" />
								</h2>
								<CardDescription>{text}</CardDescription>
							</CardHeader>
						</Card>
					</Link>
				))}
			</section>

			<section className="island-shell mb-12 flex flex-col items-start gap-4 rounded-3xl border p-6 sm:mb-16 sm:p-8 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 className="display-title text-[1.75rem] font-bold sm:text-3xl">
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
		</PublicPage>
	);
}
