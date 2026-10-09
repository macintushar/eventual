import posthog from "posthog-js";

const projectToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;

if (typeof window !== "undefined" && projectToken) {
	posthog.init(projectToken, {
		api_host: import.meta.env.VITE_POSTHOG_HOST,
		// This is a financial app: only explicit, countable events are collected.
		autocapture: false,
		capture_pageview: false,
		capture_pageleave: true,
		capture_exceptions: false,
		disable_session_recording: true,
		person_profiles: "identified_only",
	});
}

export const analyticsEnabled = Boolean(projectToken);
export { posthog };
