import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { type Brand, BrandLogo } from "#/components/brand-logo";
import {
	PublicFooter,
	PublicPage,
	publicSiteActions,
} from "#/components/public-header";
import { Button } from "#/components/ui/button";
import { useClientUser } from "#/lib/session";

/** Bump whenever either document's wording changes. */
export const LEGAL_UPDATED = "26 September 2026";

export const SOURCE_URL = "https://github.com/macintushar/eventual";

/** Each assistant opens with the prompt pre-filled; Google's `udm=50` is AI Mode. */
const assistants: {
	brand: Brand;
	name: string;
	href: (q: string) => string;
}[] = [
	{
		brand: "openai",
		name: "ChatGPT",
		href: (q) => `https://chatgpt.com/?q=${q}`,
	},
	{
		brand: "claude",
		name: "Claude",
		href: (q) => `https://claude.ai/new?q=${q}`,
	},
	{
		brand: "perplexity",
		name: "Perplexity",
		href: (q) => `https://www.perplexity.ai/search?q=${q}`,
	},
	{
		brand: "google",
		name: "Google",
		href: (q) => `https://www.google.com/search?udm=50&q=${q}`,
	},
];

function AskAi({ title, url }: { title: string; url: string }) {
	const prompt = encodeURIComponent(
		`Summarize in plain language, no legal jargon, the key points of Eventual's ${title} at ${url}`,
	);

	return (
		<section className="island-shell flex flex-col gap-4 rounded-3xl p-5 sm:p-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold">Ask AI to explain</h2>
				<p className="text-sm text-muted-foreground">
					Get a quick, plain-language summary of this page.
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				{assistants.map((assistant) => (
					<Button key={assistant.brand} variant="outline" asChild>
						<a
							href={assistant.href(prompt)}
							target="_blank"
							rel="noopener noreferrer"
						>
							<BrandLogo brand={assistant.brand} />
							{assistant.name}
						</a>
					</Button>
				))}
			</div>
		</section>
	);
}

export function LegalPage({
	kicker,
	title,
	url,
	lede,
	children,
}: {
	kicker: string;
	title: string;
	/** This page's absolute URL on this instance, handed to the assistants. */
	url: string;
	lede: ReactNode;
	children: ReactNode;
}) {
	const user = useClientUser();

	return (
		<PublicPage
			user={user}
			actions={publicSiteActions(Boolean(user))}
			footer={
				<PublicFooter tagline="Eventual · expenses without the spreadsheet.">
					<Link to="/help">Help</Link>
				</PublicFooter>
			}
			mainClassName="py-8 sm:py-10"
		>
			<article className="col-read flex flex-col gap-10">
				<header className="rise-in flex flex-col gap-3">
					<p className="island-kicker">{kicker}</p>
					<h1 className="display-title text-[2.125rem] leading-tight font-bold sm:text-4xl">
						{title}
					</h1>
					<p className="text-sm text-muted-foreground">
						Last updated {LEGAL_UPDATED}
					</p>
					<div className="text-base text-muted-foreground sm:text-lg">
						{lede}
					</div>
				</header>
				<AskAi title={title} url={url} />
				{children}
			</article>
		</PublicPage>
	);
}

export function LegalSection({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
}) {
	// Preflight strips link underlines; body links need one to read as links.
	return (
		<section
			id={id}
			className="flex scroll-mt-8 flex-col gap-3 [&_a]:underline"
		>
			<h2 className="text-xl font-semibold">{title}</h2>
			{children}
		</section>
	);
}

export function LegalList({ children }: { children: ReactNode }) {
	return <ul className="flex list-disc flex-col gap-2 pl-5">{children}</ul>;
}

export function EmailLink({ email }: { email: string }) {
	return <a href={`mailto:${email}`}>{email}</a>;
}
