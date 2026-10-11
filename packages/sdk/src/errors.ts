import type { ErrorCode } from "@eventual/schemas/errors";

/** Loose on purpose: shortcut and proxy errors don't always carry every field. */
type ApiErrorBody = {
	code?: string;
	message?: string;
	details?: {
		formErrors?: string[];
		fieldErrors?: Record<string, string[] | undefined>;
	};
};

/**
 * The server reports schema failures as a generic "Invalid request" with the
 * field messages in `details`. Surface the first one so people know what to fix.
 */
export function apiErrorMessage(error: ApiErrorBody | undefined) {
	const fallback = error?.message ?? "API request failed";
	if (error?.code !== "VALIDATION" || !error.details) return fallback;
	const formError = error.details.formErrors?.[0];
	if (formError) return formError;
	for (const [field, messages] of Object.entries(
		error.details.fieldErrors ?? {},
	)) {
		const message = messages?.[0];
		if (message)
			return `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${message}`;
	}
	return fallback;
}

/** A non-2xx response from the Eventual API. */
export class EventualApiError extends Error {
	readonly status: number;
	/** `VALIDATION`, `NOT_FOUND`, … — null when the body wasn't an API error. */
	readonly code: ErrorCode | null;
	readonly details: unknown;

	constructor(status: number, body: ApiErrorBody | undefined) {
		super(apiErrorMessage(body));
		this.name = "EventualApiError";
		this.status = status;
		this.code = (body?.code as ErrorCode | undefined) ?? null;
		this.details = body?.details;
	}
}

export function isEventualApiError(error: unknown): error is EventualApiError {
	return error instanceof EventualApiError;
}
