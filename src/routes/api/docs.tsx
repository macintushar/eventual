import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/api/docs")({
	ssr: false,
	head: () => ({
		meta: [{ title: "API Reference · Eventual" }],
	}),
	component: lazyRouteComponent(() => import("#/components/api-reference")),
});
