import { getAppLogger } from "#/lib/logging";

/** The Sentry sink owns exception capture, avoiding duplicate issues. */
export function reportError(
	error: unknown,
	tags: Record<string, string | number | boolean | undefined>,
) {
	getAppLogger("errors").error("Application error", { error, ...tags });
}
