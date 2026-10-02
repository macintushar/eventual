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
