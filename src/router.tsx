import * as Sentry from "@sentry/tanstackstart-react";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { ErrorScreen, NotFoundScreen } from "#/components/error-page";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const router = createTanStackRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		// Every route gets its own boundary, including the root, and each falls
		// back to these. Without them a thrown loader renders TanStack's unstyled
		// stack trace and a missing page renders its bare `<p>Not Found</p>`.
		defaultErrorComponent: ErrorScreen,
		defaultNotFoundComponent: () => <NotFoundScreen />,
		// Cross-fade every navigation. Browsers without the View Transition API
		// fall back to an instant swap, and the animation itself is disabled in
		// styles.css when the user prefers reduced motion.
		defaultViewTransition: true,
	});
	if (!router.isServer) {
		Sentry.addIntegration(
			Sentry.tanstackRouterBrowserTracingIntegration(router),
		);
	}

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
