import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { dispatchApi } from "#/server/http";

export const Route = createFileRoute("/api/$")({
	server: {
		handlers: {
			GET: ({ request, params }) => dispatchApi(request, params._splat ?? ""),
			POST: ({ request, params }) => dispatchApi(request, params._splat ?? ""),
			PATCH: ({ request, params }) => dispatchApi(request, params._splat ?? ""),
			DELETE: ({ request, params }) =>
				dispatchApi(request, params._splat ?? ""),
		},
	},
});
