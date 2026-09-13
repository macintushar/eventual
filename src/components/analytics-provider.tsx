import { PostHogProvider, usePostHog } from "@posthog/react";
import * as Sentry from "@sentry/tanstackstart-react";
import { useLocation } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

import { analyticsEnabled, posthog } from "#/lib/analytics/client";

function PageViewTracker() {
	const location = useLocation();
	const analytics = usePostHog();

	useEffect(() => {
		if (!analyticsEnabled || !analytics) return;
		// Deliberately omit the query string: invite and auth routes can contain tokens.
		analytics.capture("$pageview", {
			$current_url: `${window.location.origin}${location.pathname}`,
		});
	}, [analytics, location.pathname]);

	return null;
}

export function AnalyticsIdentity({ userId }: { userId: string }) {
	const analytics = usePostHog();

	useEffect(() => {
		Sentry.setUser({ id: userId });
		if (analyticsEnabled) analytics?.identify(userId);
		return () => {
			Sentry.setUser(null);
			if (analyticsEnabled) analytics?.reset();
		};
	}, [analytics, userId]);

	return null;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
	return (
		<PostHogProvider client={posthog}>
			<PageViewTracker />
			{children}
		</PostHogProvider>
	);
}
