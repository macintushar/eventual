import assert from "node:assert/strict";
import { test } from "node:test";
import { safeAuthRedirect } from "#/lib/auth-redirect";

test("post-authentication redirects stay on this site", () => {
	assert.equal(
		safeAuthRedirect("/app/groups/G?tab=expenses#latest"),
		"/app/groups/G?tab=expenses#latest",
	);
	for (const target of [
		undefined,
		"https://evil.example",
		"//evil.example",
		"/\\evil.example",
		"/app/../../\\evil.example",
		"javascript:alert(1)",
	]) {
		assert.equal(safeAuthRedirect(target), "/app");
	}
});
