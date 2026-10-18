import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Minus } from "lucide-react";
import type { ReactNode } from "react";

import { SOURCE_URL } from "#/components/legal-page";
import {
	PublicFooter,
	PublicPage,
	publicSiteActions,
} from "#/components/public-header";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { OG_IMAGES, ogImageMeta } from "#/lib/og";
import { useClientUser } from "#/lib/session";
import { SITE_URL } from "#/lib/site";

/**
 * Splitwise facts come from splitwise.com/pro. Re-check them and bump this
 * date before changing the table; don't add claims you can't source there.
 */
const CHECKED = { iso: "2026-10-18", label: "18 October 2026" };

const title = "Eventual vs Splitwise";
const description =
	"An honest comparison of Eventual and Splitwise for splitting group expenses: price, daily limits, ads, currencies, open source, self-hosting, API and AI assistants.";

export const Route = createFileRoute("/compare/splitwise")({
	head: () => ({
		meta: [
			{ title: `${title}: a free, open-source alternative · Eventual` },
			{ name: "description", content: description },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:type", content: "article" },
			{ property: "og:url", content: `${SITE_URL}/compare/splitwise` },
			{ property: "og:site_name", content: "Eventual" },
			...ogImageMeta(OG_IMAGES.compareSplitwise),
		],
		links: [{ rel: "canonical", href: `${SITE_URL}/compare/splitwise` }],
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@type": "WebPage",
					name: title,
					description,
					url: `${SITE_URL}/compare/splitwise`,
					dateModified: CHECKED.iso,
					about: [
						{ "@id": `${SITE_URL}/#app` },
						{
							"@type": "SoftwareApplication",
							name: "Splitwise",
							url: "https://www.splitwise.com",
						},
					],
				}),
			},
		],
	}),
	component: ComparePage,
});

const yes = <Check className="size-4 text-positive" aria-label="Yes" />;
const no = <Minus className="size-4 text-muted-foreground" aria-label="No" />;

const rows: { label: string; eventual: ReactNode; splitwise: ReactNode }[] = [
	{
		label: "Price",
		eventual: "Free. No paid plan.",
		splitwise: "Free plan, plus a paid Splitwise Pro subscription",
	},
	{
		label: "Expenses per day",
		eventual: "Unlimited",
		splitwise: "Limited on the free plan; unlimited with Pro",
	},
	{
		label: "Ads",
		eventual: "None",
		splitwise: "On the free plan; Pro is ad-free",
	},
	{
		label: "Expense search",
		eventual: yes,
		splitwise: "Pro",
	},
	{
		label: "Currency conversion",
		eventual: "No, by design: each currency is settled on its own",
		splitwise: "Pro",
	},
	{
		label: "Receipt scanning and itemization",
		eventual: no,
		splitwise: "Pro",
	},
	{
		label: "Spending charts",
		eventual: "CSV and PDF report export instead",
		splitwise: "Pro",
	},
	{
		label: "iPhone and Android apps",
		eventual: "Native app, built from source; not in the stores yet",
		splitwise: "In the App Store and Google Play",
	},
	{
		label: "Open source",
		eventual: "Yes, AGPL-3.0",
		splitwise: no,
	},
	{
		label: "Self-hosting",
		eventual: yes,
		splitwise: no,
	},
	{
		label: "Public API",
		eventual: "REST with an OpenAPI 3.1 spec, plus a TypeScript SDK",
		splitwise: yes,
	},
	{
		label: "MCP server for AI assistants",
		eventual: "Built in",
		splitwise: "Not built in; community projects exist",
	},
];

const ahead = [
	{
		title: "It's in the app stores",
		text: "Splitwise installs in a tap on iPhone and Android. Eventual's native app has to be built from source for now, though the web app works on any phone.",
	},
	{
		title: "Everyone already has it",
		text: "Splitwise has been around for years, so your friends may already use it. With Eventual, someone has to invite the group.",
	},
	{
		title: "Receipts and conversion",
		text: "Splitwise Pro scans receipts, itemizes them and converts currencies at current rates. Eventual does none of these.",
	},
];

const different = [
	{
		title: "No limits, no ads, no upgrade",
		text: "Every feature is free, with no daily cap. There's nothing to unlock.",
	},
	{
		title: "Exact in every currency",
		text: "Shares are exact to the smallest unit of each currency, so they always add up. Paying in rupees? The mobile app hands off to UPI.",
	},
	{
		title: "Paid means paid",
		text: "Once someone marks their share paid, the expense locks, so the amount they settled can't change underneath them.",
	},
	{
		title: "Yours to run",
		text: "The code is open source. Run your own copy on your own database, or use the hosted one.",
	},
	{
		title: "Talk to it",
		text: "Connect Claude, ChatGPT, Cursor or any MCP client and log a bill by asking. Or build on the REST API and SDK.",
	},
	{
		title: "Every currency stays separate",
		text: "Twenty currencies, each exact to its own smallest unit, each with its own balance. No exchange-rate arguments.",
	},
];

function ComparePage() {
	const user = useClientUser();

	return (
		<PublicPage
			user={user}
			actions={publicSiteActions(Boolean(user))}
			footer={
				<PublicFooter tagline="Eventual · split it fairly, settle it once.">
					<Link to="/help">Help</Link>
					<Link to="/docs">Integrations</Link>
				</PublicFooter>
			}
			mainClassName="gap-8 py-8 sm:gap-12 sm:py-10"
		>
			<section className="rise-in flex max-w-2xl flex-col gap-4">
				<p className="island-kicker">Compare</p>
				<h1 className="display-title text-[2.125rem] leading-tight font-bold sm:text-5xl">
					Eventual vs Splitwise
				</h1>
				<p className="text-base text-muted-foreground sm:text-lg">
					Both apps track who paid what and who owes whom. Splitwise is the
					established one, with store apps and paid extras. Eventual is free,
					open source and exact in 20 currencies, with nothing behind a paywall.
				</p>
				<p className="text-sm text-muted-foreground">
					Splitwise details checked on{" "}
					<time dateTime={CHECKED.iso}>{CHECKED.label}</time> against{" "}
					<a
						href="https://www.splitwise.com/pro"
						target="_blank"
						rel="noreferrer"
					>
						splitwise.com/pro
					</a>
					. Plans change, so check there for current pricing.
				</p>
			</section>

			<section className="overflow-x-auto rounded-2xl border bg-card">
				<table className="w-full text-sm">
					<caption className="sr-only">
						Feature comparison of Eventual and Splitwise
					</caption>
					<thead className="text-left">
						<tr className="border-b">
							<th className="w-1/3 px-4 py-3 font-medium text-muted-foreground">
								Feature
							</th>
							<th className="px-4 py-3 font-semibold">Eventual</th>
							<th className="px-4 py-3 font-semibold">Splitwise</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.label} className="border-b last:border-0">
								<th
									scope="row"
									className="px-4 py-3 text-left font-medium text-muted-foreground"
								>
									{row.label}
								</th>
								<td className="px-4 py-3">{row.eventual}</td>
								<td className="px-4 py-3">{row.splitwise}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="display-title text-2xl font-bold sm:text-3xl">
					Where Splitwise is ahead
				</h2>
				<div className="grid gap-3 sm:gap-4 md:grid-cols-3">
					{ahead.map((item) => (
						<Card key={item.title} className="feature-card">
							<CardHeader>
								<CardTitle className="leading-snug">{item.title}</CardTitle>
								<CardDescription>{item.text}</CardDescription>
							</CardHeader>
						</Card>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="display-title text-2xl font-bold sm:text-3xl">
					Where Eventual is different
				</h2>
				<div className="grid gap-3 sm:gap-4 md:grid-cols-3">
					{different.map((item) => (
						<Card key={item.title} className="feature-card">
							<CardHeader>
								<CardTitle className="leading-snug">{item.title}</CardTitle>
								<CardDescription>{item.text}</CardDescription>
							</CardHeader>
						</Card>
					))}
				</div>
			</section>

			<section className="flex max-w-2xl flex-col gap-3">
				<h2 className="display-title text-2xl font-bold sm:text-3xl">
					Which should you use?
				</h2>
				<p className="text-muted-foreground">
					Pick Splitwise if your group already uses it, if you want receipt
					scanning or currency conversion, or if everyone needs to install an
					app from the store today.
				</p>
				<p className="text-muted-foreground">
					Pick Eventual if you're tired of daily limits and ads, split across
					currencies without arguing over exchange rates, want to log expenses
					through an AI assistant or your own code, or want to host your own
					copy.{" "}
					<a href={SOURCE_URL} target="_blank" rel="noreferrer">
						Read the source
					</a>
					.
				</p>
			</section>

			<section className="island-shell mb-12 flex flex-col items-start gap-4 rounded-3xl border p-6 sm:mb-16 sm:p-8 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 className="display-title text-[1.75rem] font-bold sm:text-3xl">
						Try it on your next trip.
					</h2>
					<p className="mt-2 text-muted-foreground">
						Start a group, invite everyone, and settle up once when you're back.
					</p>
				</div>
				<Button size="lg" asChild>
					<Link to="/signup">
						Start a group
						<ArrowRight data-icon="inline-end" />
					</Link>
				</Button>
			</section>
		</PublicPage>
	);
}
