import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUpiUrl } from "./upi";

test("encodes pa/pn/am/cu and normalises the VPA", () => {
	assert.equal(
		buildUpiUrl({
			pa: "asha.K@okicici",
			pn: "Asha Sharma",
			amountMinor: 123456,
			cu: "INR",
		}),
		"upi://pay?pa=asha.k%40okicici&pn=Asha+Sharma&am=1234.56&cu=INR",
	);
});

test("amount in paise renders with two decimals and note is optional", () => {
	assert.equal(
		buildUpiUrl({ pa: "a@b", pn: "A", amountMinor: 500, tn: "Trip" }),
		"upi://pay?pa=a%40b&pn=A&am=5.00&cu=INR&tn=Trip",
	);
});
