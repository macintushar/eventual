import assert from "node:assert/strict";
import { test } from "node:test";
import { apiErrorMessage } from "#/lib/api-error";

test("validation errors name the field that failed", () => {
	assert.equal(
		apiErrorMessage({
			code: "VALIDATION",
			message: "Invalid request",
			details: {
				formErrors: [],
				fieldErrors: {
					phone: ["Include the country code, e.g. +919876543210"],
				},
			},
		}),
		"Phone: Include the country code, e.g. +919876543210",
	);
	assert.equal(
		apiErrorMessage({
			code: "VALIDATION",
			message: "Invalid request",
			details: { formErrors: ["Choose two different users"], fieldErrors: {} },
		}),
		"Choose two different users",
	);
});

test("other errors keep the server message", () => {
	assert.equal(
		apiErrorMessage({ code: "CONFLICT", message: "Already a member" }),
		"Already a member",
	);
	assert.equal(
		apiErrorMessage({ code: "VALIDATION", message: "Malformed JSON" }),
		"Malformed JSON",
	);
	assert.equal(apiErrorMessage(undefined), "API request failed");
});
