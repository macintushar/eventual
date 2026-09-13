import { getRequest } from "@tanstack/react-start/server";

import { reportError } from "#/server/error-reporting";

type WaitUntilRequest = Request & {
	waitUntil?: (task: Promise<unknown>) => void;
};

/**
 * Keeps non-critical work off the response path while allowing serverless
 * runtimes to keep the request alive until it settles. Node development has no
 * waitUntil hook, but the started promise still runs on its event loop.
 */
export function runInBackground(
	task: Promise<unknown>,
	tags: Record<string, string | number | boolean | undefined>,
) {
	const guarded = task.catch((error) => reportError(error, tags));
	try {
		(getRequest() as WaitUntilRequest).waitUntil?.(guarded);
	} catch {
		// Some tests and non-request runtimes have no request context.
	}
}
