import { createFileRoute, Link, notFound } from "@tanstack/react-router";
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
import { helpArticle } from "#/lib/help";
import { SITE_URL } from "#/lib/site";

export const Route = createFileRoute("/help/$slug")({
	loader: ({ params }) => {
		const article = helpArticle(params.slug);
		if (!article) throw notFound();
		return article;
	},
	head: ({ loaderData }) => ({
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

function HelpArticlePage() {
	const article = Route.useLoaderData();

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/help" className="text-tape no-underline">
								Help center
							</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{article.title}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<header className="flex flex-col gap-3">
				<p className="island-kicker">{article.kicker}</p>
				<h1 className="display-title text-[2.125rem] font-bold sm:text-4xl">
					{article.title}
				</h1>
				<p className="max-w-2xl text-muted-foreground sm:text-lg">
					{article.lede}
				</p>
			</header>

			<ol className="flex flex-col gap-8">
				{article.steps.map((step, index) => (
					<li key={step.title} className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<p className="text-sm text-muted-foreground">
								Step {index + 1} of {article.steps.length}
							</p>
							<h2 className="display-title text-2xl font-bold">{step.title}</h2>
							<p className="text-muted-foreground">{step.body}</p>
						</div>
						<HelpShot steps={article.steps} index={index} />
					</li>
				))}
			</ol>

			<div className="flex flex-wrap gap-3 pb-8">
				<Button asChild>
					<Link to="/help">Back to help center</Link>
				</Button>
				<Button variant="outline" asChild>
					<Link to="/app">Open the app</Link>
				</Button>
			</div>
		</div>
	);
}
