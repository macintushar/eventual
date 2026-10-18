import { currencies, currencySymbol } from "@eventual/schemas/currencies";
import { formatMinor } from "@eventual/schemas/money";
import { computeShares } from "@eventual/schemas/split";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import {
	PublicFooter,
	PublicPage,
	publicSiteActions,
} from "#/components/public-header";
import { Button } from "#/components/ui/button";
import { Card, CardHeader, CardTitle } from "#/components/ui/card";
import { CURRENCY_PAGES, type CurrencyPage } from "#/lib/currency-pages";
import { OG_IMAGES, ogImageMeta } from "#/lib/og";
import { useClientUser } from "#/lib/session";
import { SITE_URL } from "#/lib/site";

const title = "Split group expenses in 20 currencies";
const description =
	"Eventual splits shared expenses in rupees, dirhams, baht, dong and 16 other currencies, each to its own smallest unit. Balances stay separate per currency and are never converted.";

export const Route = createFileRoute("/split-expenses/")({
	head: () => ({
		meta: [
			{ title: `${title} · Eventual` },
			{ name: "description", content: description },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: `${SITE_URL}/split-expenses` },
			{ property: "og:site_name", content: "Eventual" },
			...ogImageMeta(OG_IMAGES.currencies),
		],
		links: [{ rel: "canonical", href: `${SITE_URL}/split-expenses` }],
	}),
	component: CurrenciesHub,
});

function smallestUnit(decimals: number) {
	if (decimals === 0) return "Whole units";
	return `1/${10 ** decimals}`;
}

/** 100 of a currency split evenly three ways, by the app's own splitter. */
function hundredThreeWays(code: string, decimals: number) {
	return computeShares(
		100 * 10 ** decimals,
		"even",
		["a", "b", "c"].map((userId) => ({ userId, input: null })),
		code,
	)
		.map((share) => formatMinor(share.amountMinor, code))
		.join(", ");
}

function CurrenciesHub() {
	const user = useClientUser();
	const pages = new Map<string, CurrencyPage>(
		CURRENCY_PAGES.map((page) => [page.code, page]),
	);

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
				<p className="island-kicker">Currencies</p>
				<h1 className="display-title text-[2.125rem] leading-tight font-bold sm:text-5xl">
					{title}.
				</h1>
				<p className="text-base text-muted-foreground sm:text-lg">
					Every expense keeps the currency it was paid in. Shares are exact to
					that currency's smallest unit, so they always add up, and each
					currency gets its own balance. Eventual never converts between them,
					so nobody argues over an exchange rate.
				</p>
			</section>

			<section className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
				{CURRENCY_PAGES.map((page) => (
					<Link
						key={page.slug}
						to="/split-expenses/$currency"
						params={{ currency: page.slug }}
						className="no-underline"
					>
						<Card className="feature-card h-full">
							<CardHeader>
								<p className="text-xs font-medium text-muted-foreground">
									{page.kicker}
								</p>
								<CardTitle className="flex items-center gap-2 leading-snug">
									{page.title}
									<ArrowRight className="size-4 shrink-0" aria-hidden="true" />
								</CardTitle>
							</CardHeader>
						</Card>
					</Link>
				))}
			</section>

			<section className="flex flex-col gap-4">
				<div className="max-w-2xl">
					<h2 className="display-title text-2xl font-bold sm:text-3xl">
						Every supported currency
					</h2>
					<p className="mt-2 text-muted-foreground">
						The smallest unit decides how finely a bill can split. Yen, won and
						dong have none, so leftovers go out in whole units. The Kuwaiti
						dinar splits to a thousandth.
					</p>
				</div>
				<div className="overflow-x-auto rounded-2xl border bg-card">
					<table className="w-full text-sm">
						<thead className="text-left text-muted-foreground">
							<tr className="border-b">
								<th className="px-4 py-3 font-medium">Currency</th>
								<th className="px-4 py-3 font-medium">Code</th>
								<th className="px-4 py-3 font-medium">Symbol</th>
								<th className="px-4 py-3 font-medium">Smallest unit</th>
								<th className="px-4 py-3 font-medium">100 split three ways</th>
							</tr>
						</thead>
						<tbody>
							{currencies.map((currency) => {
								const page = pages.get(currency.code);
								return (
									<tr key={currency.code} className="border-b last:border-0">
										<td className="px-4 py-3">
											{page ? (
												<Link
													to="/split-expenses/$currency"
													params={{ currency: page.slug }}
												>
													{currency.name}
												</Link>
											) : (
												currency.name
											)}
										</td>
										<td className="px-4 py-3 font-mono">{currency.code}</td>
										<td className="px-4 py-3">
											{currencySymbol(currency.code)}
										</td>
										<td className="px-4 py-3">
											{smallestUnit(currency.decimals)}
										</td>
										<td className="tabular px-4 py-3">
											{hundredThreeWays(currency.code, currency.decimals)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>

			<section className="island-shell mb-12 flex flex-col items-start gap-4 rounded-3xl border p-6 sm:mb-16 sm:p-8 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 className="display-title text-[1.75rem] font-bold sm:text-3xl">
						One group, any mix of currencies.
					</h2>
					<p className="mt-2 text-muted-foreground">
						Log the flights in rupees and the hotel in baht. Each settles on its
						own.
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
