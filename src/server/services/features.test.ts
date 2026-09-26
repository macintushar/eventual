import assert from "node:assert/strict";
import { test } from "node:test";

import { categorizeDescription, normalizeSearchText } from "./categories";
import { csvCell, renderExpenseCsv, renderPdf, reportTotals } from "./reports";

test("category rules are deterministic, prioritized, and explainable", () => {
	const result = categorizeDescription("Coffee at Central Station", [
		{ id: "later", pattern: "coffee", category: "Food", priority: 1 },
		{ id: "first", pattern: "station", category: "Transport", priority: 2 },
	]);
	assert.deepEqual(result, {
		category: "Transport",
		source: "rule",
		ruleId: "first",
		pattern: "station",
	});
	assert.equal(normalizeSearchText("  CAFÉ\n", "Taxi"), "café taxi");
});

test("reports preserve currencies, neutralize formulas, and emit valid PDF", () => {
	const rows = [
		{
			id: "e",
			date: new Date("2026-01-01T00:00:00Z"),
			description: '=HYPERLINK("bad")',
			notes: null,
			category: "Food",
			currency: "INR",
			amountMinor: 123,
			paidByUserId: "u",
		},
	];
	assert.equal(csvCell(" +SUM(A1)"), '"\' +SUM(A1)"');
	assert.match(renderExpenseCsv(rows), /'=HYPERLINK/);
	assert.deepEqual(reportTotals(rows), [
		{ currency: "INR", category: "Food", amountMinor: 123, count: 1 },
	]);
	assert.equal(
		Buffer.from(renderPdf(["Report"]))
			.subarray(0, 8)
			.toString(),
		"%PDF-1.4",
	);
});
