import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { HelpShot } from "#/components/help-shot";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { Button } from "#/components/ui/button";
import { HELP_UPDATED, type HelpArticle, helpArticle } from "#/lib/help";
import { SITE_URL } from "#/lib/site";

export const Route = createFileRoute("/help/$slug")({
	loader: ({ params }) => {
		const article = helpArticle(params.slug);
		if (!article) throw notFound();
		return article;
	},
	head: ({ loaderData }) => ({
		scripts: loaderData ? [articleJsonLd(loaderData)] : [],
		meta: [
			{ title: `${loaderData?.title ?? "Help"} · Eventual` },
			{
				name: "description",
				content: loaderData?.lede ?? "How to use Eventual.",
			},
			{
				property: "og:title",
				content: loaderData?.title ?? "Help · Eventual",
			},
			{
				name: "twitter:card",
				content: "summary",
			},
		],
		links: [
			{
				rel: "canonical",
				href: `${SITE_URL}/help/${loaderData?.slug ?? ""}`,
			},
		],
	}),
	component: HelpArticlePage,
});

function articleJsonLd(article: HelpArticle) {
	const url = `${SITE_URL}/help/${article.slug}`;
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
							name: "Help center",
							item: `${SITE_URL}/help`,
						},
						{
							"@type": "ListItem",
							position: 2,
							name: article.title,
							item: url,
						},
					],
				},
				{
					"@type": "HowTo",
					name: article.title,
					description: article.lede,
					url,
					dateModified: HELP_UPDATED.iso,
					step: article.steps.map((step, index) => ({
						"@type": "HowToStep",
						position: index + 1,
						name: step.title,
						text: step.body,
						image: `${SITE_URL}${step.image}`,
						url: `${url}#step-${index + 1}`,
					})),
				},
			],
		}),
	};
}

function HelpArticlePage() {
	const article = Route.useLoaderData();

	return (
		<div className="col-read flex flex-col gap-10">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/help">Help center</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{article.title}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<header className="rise-in flex flex-col gap-3">
				<p className="island-kicker">{article.kicker}</p>
				<h1 className="display-title text-[2.125rem] leading-tight font-bold sm:text-4xl">
					{article.title}
				</h1>
				<p className="text-sm text-muted-foreground">
					Last updated{" "}
					<time dateTime={HELP_UPDATED.iso}>{HELP_UPDATED.label}</time>
				</p>
				<p className="text-base text-muted-foreground sm:text-lg">
					{article.lede}
				</p>
			</header>

			<ol className="flex flex-col gap-10">
				{article.steps.map((step, index) => (
					<li
						key={step.title}
						id={`step-${index + 1}`}
						className="flex scroll-mt-8 flex-col gap-4"
					>
						<div className="flex items-start gap-3">
							<span className="tabular grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
								{index + 1}
							</span>
							<div className="flex flex-col gap-1">
								<p className="text-xs text-muted-foreground">
									Step {index + 1} of {article.steps.length}
								</p>
								<h2 className="text-xl font-semibold">{step.title}</h2>
								<p className="text-muted-foreground">{step.body}</p>
							</div>
						</div>
						<HelpShot steps={article.steps} index={index} />
					</li>
				))}
			</ol>

			<section className="island-shell mb-4 flex flex-col gap-4 rounded-3xl border p-6 sm:p-8">
				<div>
					<h2 className="display-title text-[1.75rem] font-bold sm:text-3xl">
						That's all it takes.
					</h2>
					<p className="mt-2 text-muted-foreground">
						Try it in the app, or head back for more answers.
					</p>
				</div>
				<div className="flex flex-wrap gap-3">
					<Button size="lg" asChild>
						<Link to="/app">
							Open the app
							<ArrowRight data-icon="inline-end" />
						</Link>
					</Button>
					<Button size="lg" variant="outline" asChild>
						<Link to="/help">Back to help center</Link>
					</Button>
				</div>
			</section>
		</div>
	);
}
