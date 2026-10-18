// Relative imports only: vite.config.ts loads this file before the app's
// path aliases exist.
import { HELP_ARTICLES, HELP_UPDATED } from "./help";

/**
 * Every public, indexable page. Each one is prerendered at build time and
 * listed in /sitemap.xml, so adding a page here does both.
 *
 * `updated` is the date its content last changed; bump it with the copy.
 */
export type PublicPage = { path: string; updated: string };

const MARKETING_UPDATED = "2026-10-18";
const LEGAL_UPDATED_ISO = "2026-10-18";

export const PUBLIC_PAGES: PublicPage[] = [
	{ path: "/", updated: MARKETING_UPDATED },
	{ path: "/docs", updated: MARKETING_UPDATED },
	{ path: "/help", updated: HELP_UPDATED.iso },
	...HELP_ARTICLES.map((article) => ({
		path: `/help/${article.slug}`,
		updated: HELP_UPDATED.iso,
	})),
	{ path: "/compare/splitwise", updated: MARKETING_UPDATED },
	{ path: "/privacy", updated: LEGAL_UPDATED_ISO },
	{ path: "/terms", updated: LEGAL_UPDATED_ISO },
];

export function sitemapXml(origin: string) {
	const urls = PUBLIC_PAGES.map(
		({ path, updated }) =>
			`  <url>\n    <loc>${origin}${path}</loc>\n    <lastmod>${updated}</lastmod>\n  </url>`,
	);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
