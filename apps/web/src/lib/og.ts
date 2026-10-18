import { CURRENCY_PAGES, type CurrencyPage } from "#/lib/currency-pages";
import type { HelpArticle } from "#/lib/help";
import { HELP_ARTICLES } from "#/lib/help";
import { type McpClient, mcpClients } from "#/lib/mcp-clients";
import { SITE_URL } from "#/lib/site";

/**
 * Share images for public pages. `bun run og:generate` renders one PNG per
 * entry into public/og/, and each page's head points at its file. Add an entry
 * here when a public page gets its own image, then regenerate.
 */
export type OgImage = {
	/** File name under public/og/, without the extension. */
	slug: string;
	kicker: string;
	title: string;
};

export const OG_IMAGES = {
	home: {
		slug: "home",
		kicker: "Split expenses for trips, flats and every chai run",
		// Non-breaking hyphen so "group-chat" never splits across lines.
		title: "Settle up without the group\u2011chat maths.",
	},
	docs: {
		slug: "docs",
		kicker: "Integrations",
		title: "The mobile app, Shortcuts, AI assistants, the SDK and the API.",
	},
	help: {
		slug: "help",
		kicker: "Help center",
		title: "Groups, expenses, splits and settling up, answered.",
	},
	compareSplitwise: {
		slug: "compare-splitwise",
		kicker: "Compare",
		title: "Eventual vs Splitwise: free, open source, no daily limits.",
	},
	currencies: {
		slug: "currencies",
		kicker: "Currencies",
		title: "Split group expenses in 20 currencies, never converted.",
	},
} satisfies Record<string, OgImage>;

export function helpArticleOg(article: HelpArticle): OgImage {
	return {
		slug: `help-${article.slug}`,
		kicker: `Help · ${article.kicker}`,
		title: article.title,
	};
}

export function mcpClientOg(client: Pick<McpClient, "id" | "name">): OgImage {
	return {
		slug: `mcp-${client.id}`,
		kicker: "AI assistants · MCP",
		title: `Log shared expenses by asking ${client.name}.`,
	};
}

export function currencyPageOg(page: CurrencyPage): OgImage {
	return {
		slug: `currency-${page.slug}`,
		// Codes, not symbols: the bundled fonts have no ₹ or ₫, and a missing
		// glyph makes @vercel/og fetch a fallback font over the network.
		kicker: `${page.kicker.split(" · ")[0]} · ${page.code}`,
		title: `${page.title}.`,
	};
}

/** Every image the generator renders. */
export function allOgImages(): OgImage[] {
	return [
		...Object.values(OG_IMAGES),
		...HELP_ARTICLES.map(helpArticleOg),
		// The URL only fills in config snippets; names and ids don't depend on it.
		...mcpClients("").map(mcpClientOg),
		...CURRENCY_PAGES.map(currencyPageOg),
	];
}

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export function ogImageUrl(slug: string) {
	return `${SITE_URL}/og/${slug}.png`;
}

/** Open Graph and Twitter tags for a page's share image. */
export function ogImageMeta(image: Pick<OgImage, "slug" | "title">) {
	const url = ogImageUrl(image.slug);
	return [
		{ property: "og:image", content: url },
		{ property: "og:image:width", content: String(OG_WIDTH) },
		{ property: "og:image:height", content: String(OG_HEIGHT) },
		{ property: "og:image:alt", content: image.title },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:image", content: url },
	];
}
