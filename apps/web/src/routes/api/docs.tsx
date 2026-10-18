import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/api/docs")({
	ssr: false,
	head: () => ({
		// Client-only, so crawlers get an empty shell: keep it out of the index
		// and let llms.txt point at the OpenAPI JSON instead.
		meta: [
			{ title: "API Reference · Eventual" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: lazyRouteComponent(() => import("#/components/api-reference")),
});
