import { createFileRoute } from "@tanstack/react-router";
import { sitemapXml } from "#/lib/public-pages";
import { SITE_URL } from "#/lib/site";

// Prerendered with the pages it lists, so the deployed file is static.
export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: () =>
				new Response(sitemapXml(SITE_URL), {
					headers: { "Content-Type": "application/xml; charset=utf-8" },
				}),
		},
	},
});
