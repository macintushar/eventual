/** The message to show under a field, whether the validator returned a string or a schema issue. */
export function fieldError(errors: ReadonlyArray<unknown>) {
	const error = errors[0];
	if (error == null || error === false) return undefined;
	if (typeof error === "string") return error;
	if (
		typeof error === "object" &&
		"message" in error &&
		typeof error.message === "string"
	)
		return error.message;
	return "Check this field";
}
