import { isEventualApiError } from "@eventual/sdk";
import { OfflineWriteError } from "./reliability";

/**
 * A fresh key for one write. The server replays the first response for a
 * repeated key, so a retried request can't apply twice.
 */
export function idempotencyKey() {
	const random = () => Math.random().toString(36).slice(2, 10);
	return `mobile-${Date.now().toString(36)}-${random()}${random()}`;
}

/** One logical write per sheet. An uncertain result retains the original closure
 * and key, even if form state changes. Success is cached until the sheet closes.
 */
export function createWriteAttempt() {
	let attempt: {
		key: string;
		send: (key: string) => Promise<unknown>;
		result?: { value: unknown };
	} | null = null;
	let inFlight: Promise<unknown> | null = null;
	return {
		get unresolved() {
			return attempt !== null && !attempt.result;
		},
		async run<T>(send: (key: string) => Promise<T>): Promise<T> {
			if (inFlight) return inFlight as Promise<T>;
			if (attempt?.result) return attempt.result.value as T;
			const first = attempt === null;
			attempt ??= { key: idempotencyKey(), send };
			const current = attempt;
			inFlight = (async () => {
				try {
					const value = await current.send(current.key);
					current.result = { value };
					return value;
				} catch (error) {
					// Domain refusals prove this write did not commit, even on a retry.
					// Generic 409s can mean the original write is still in progress.
					const splitChanged =
						isEventualApiError(error) &&
						(error.details as { reason?: string } | undefined)?.reason ===
							"split_changed";
					if (
						splitChanged ||
						(isEventualApiError(error) &&
							(error.code === "EXPENSE_LOCKED" ||
								error.code === "VALIDATION")) ||
						(first &&
							(error instanceof OfflineWriteError ||
								(isEventualApiError(error) &&
									error.code !== null &&
									error.status >= 400 &&
									error.status < 500 &&
									error.status !== 409)))
					) {
						attempt = null;
					}
					throw error;
				}
			})();
			try {
				return (await inFlight) as T;
			} finally {
				inFlight = null;
			}
		},
	};
}
