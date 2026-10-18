import { formatMinor } from "@eventual/schemas/money";
import { computeShares } from "@eventual/schemas/split";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import {
	PublicFooter,
	PublicPage,
	publicSiteActions,
} from "#/components/public-header";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "#/components/ui/card";
import {
	CURRENCY_PAGES,
	type CurrencyExample,
	type CurrencyPage,
	currencyPage,
	EXAMPLE_PEOPLE,
} from "#/lib/currency-pages";
import { currencyPageOg, ogImageMeta } from "#/lib/og";
import { useClientUser } from "#/lib/session";
import { SITE_URL } from "#/lib/site";

export const Route = createFileRoute("/split-expenses/$currency")({
	loader: ({ params }) => {
		const page = currencyPage(params.currency);
		if (!page) throw notFound();
		return page;
	},
	head: ({ loaderData: page }) => {
		if (!page) return {};
		const url = `${SITE_URL}/split-expenses/${page.slug}`;
		return {
			meta: [
				{ title: `${page.title} · Eventual` },
				{ name: "description", content: page.description },
				{ property: "og:title", content: page.title },
				{ property: "og:description", content: page.description },
				{ property: "og:type", content: "article" },
				{ property: "og:url", content: url },
				{ property: "og:site_name", content: "Eventual" },
				...ogImageMeta(currencyPageOg(page)),
			],
			links: [{ rel: "canonical", href: url }],
			scripts: [jsonLd(page, url)],
		};
	},
	component: CurrencyPageView,
});

function jsonLd(page: CurrencyPage, url: string) {
	return {
		type: "application/ld+json",
		children: JSON.stringify({
			"@context": "https://schema.org",
			"@graph": [
				{
					"@type": "BreadcrumbList",
					itemListElement: [
						{
							"@type": "ListItem",
							position: 1,
							name: "Split expenses in any currency",
							item: `${SITE_URL}/split-expenses`,
						},
						{
							"@type": "ListItem",
							position: 2,
							name: page.title,
							item: url,
						},
					],
				},
				{
					"@type": "FAQPage",
					mainEntity: page.faqs.map(({ question, answer }) => ({
						"@type": "Question",
						name: question,
						acceptedAnswer: { "@type": "Answer", text: answer },
					})),
				},
			],
		}),
	};
}

/** Runs the real splitter, so the page can't disagree with the app. */
function exampleShares(example: CurrencyExample, currency: string) {
	const people = EXAMPLE_PEOPLE.slice(
		0,
		example.inputs?.length ?? example.people ?? 3,
	);
	const shares = computeShares(
		example.totalMinor,
		example.method,
		people.map((_, index) => ({
			// Zero-padded IDs keep the splitter's tie-break order equal to ours.
			userId: `user-${index}`,
			input: example.inputs?.[index] ?? null,
		})),
		currency,
	);
	return shares.map((share, index) => ({
		name: people[index],
		amount: formatMinor(share.amountMinor, currency),
		input: example.inputs?.[index],
	}));
}

function inputLabel(method: CurrencyExample["method"], input?: number) {
	if (input === undefined) return null;
	if (method === "shares")
		return `${input} ${input === 1 ? "share" : "shares"}`;
	if (method === "percent") return `${input / 100}%`;
	return null;
}

function CurrencyPageView() {
	const page = Route.useLoaderData();
	const user = useClientUser();
	const siblings = CURRENCY_PAGES.filter((entry) => entry.slug !== page.slug);

	return (
		<PublicPage
			user={user}
			actions={publicSiteActions(Boolean(user))}
			footer={
				<PublicFooter tagline="Eventual · split it fairly, settle it once.">
					<Link to="/help">Help</Link>
				</PublicFooter>
			}
			mainClassName="gap-8 py-8 sm:gap-12 sm:py-10"
		>
			<section className="rise-in flex max-w-2xl flex-col gap-4">
				<p className="island-kicker">{page.kicker}</p>
				<h1 className="display-title text-[2.125rem] leading-tight font-bold sm:text-5xl">
					{page.title}
				</h1>
				<p className="text-base text-muted-foreground sm:text-lg">
					{page.lede}
				</p>
				<div className="flex flex-wrap gap-3 pt-2">
					<Button size="lg" asChild>
						<Link to="/signup">
							Start a group
							<ArrowRight data-icon="inline-end" />
						</Link>
					</Button>
					<Button size="lg" variant="outline" asChild>
						<Link to="/split-expenses">All currencies</Link>
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="display-title text-2xl font-bold sm:text-3xl">
					How a bill splits in {page.plural}
				</h2>
				<div className="grid gap-3 sm:gap-4 md:grid-cols-2">
					{page.examples.map((example) => (
						<Card key={example.label} className="island-shell rounded-3xl">
							<CardHeader>
								<h3 className="font-semibold">{example.label}</h3>
								<CardDescription>{example.note}</CardDescription>
							</CardHeader>
							<CardContent>
								<ul className="flex flex-col divide-y rounded-2xl border bg-background/60">
									{exampleShares(example, page.code).map((row) => (
										<li
											key={row.name}
											className="flex items-center justify-between gap-3 px-4 py-2.5"
										>
											<span>
												{row.name}
												{inputLabel(example.method, row.input) ? (
													<span className="text-muted-foreground">
														{" "}
														· {inputLabel(example.method, row.input)}
													</span>
												) : null}
											</span>
											<strong className="tabular">{row.amount}</strong>
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					))}
				</div>
			</section>

			<section className="grid gap-3 sm:gap-4 md:grid-cols-3">
				{page.points.map((point) => (
					<Card key={point.title} className="feature-card">
						<CardHeader>
							<h2 className="leading-none font-semibold">{point.title}</h2>
							<CardDescription>{point.text}</CardDescription>
						</CardHeader>
					</Card>
				))}
			</section>

			<section className="flex max-w-2xl flex-col gap-3">
				<h2 className="display-title text-2xl font-bold sm:text-3xl">
					Questions
				</h2>
				<Accordion type="multiple">
					{page.faqs.map((faq) => (
						<AccordionItem key={faq.question} value={faq.question}>
							<AccordionTrigger>{faq.question}</AccordionTrigger>
							<AccordionContent>
								<p className="text-muted-foreground">{faq.answer}</p>
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			</section>

			<nav
				aria-label="Other currencies"
				className="flex flex-col gap-3 pb-8 sm:pb-12"
			>
				<h2 className="font-semibold">Splitting in another currency?</h2>
				<ul className="flex flex-wrap gap-2">
					{siblings.map((entry) => (
						<li key={entry.slug}>
							<Button variant="outline" size="sm" asChild>
								<Link
									to="/split-expenses/$currency"
									params={{ currency: entry.slug }}
								>
									{entry.kicker}
								</Link>
							</Button>
						</li>
					))}
					<li>
						<Button variant="link" size="sm" asChild>
							<Link to="/split-expenses">
								All 20 currencies
								<ArrowRight data-icon="inline-end" />
							</Link>
						</Button>
					</li>
				</ul>
			</nav>
		</PublicPage>
	);
}
