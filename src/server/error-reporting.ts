import * as Sentry from "@sentry/tanstackstart-react";

export function reportError(
	error: unknown,
	tags: Record<string, string | number | boolean | undefined>,
) {
	Sentry.captureException(error, { tags });
}
