import * as Sentry from "@sentry/tanstackstart-react";

export function reportError(
	error: unknown,
	tags: Record<string, string | number | boolean | undefined>,
) {
	if (!process.env.SENTRY_DSN)
		console.error("Application error", { error, tags });
	Sentry.captureException(error, { tags });
}
