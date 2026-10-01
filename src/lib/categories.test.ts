import assert from "node:assert/strict";
import { test } from "node:test";
import { builtInCategory } from "#/lib/categories";

test("built-in keywords match whole words and phrases", () => {
	assert.deepEqual(builtInCategory("Coffee at Central Station"), {
		category: "Food & drink",
		keyword: "coffee",
	});
	assert.deepEqual(builtInCategory("March water bill"), {
		category: "Utilities",
		keyword: "water bill",
	});
	assert.equal(builtInCategory("Busking tips"), null);
	assert.equal(builtInCategory("Zomato"), null);
});
