import { describe, expect, test } from "bun:test";
import {
	canStartGuestMerge,
	guestMergeProblem,
	guestMergeReviewKey,
	isMergeSource,
} from "./guest-merge-policy.ts";

const guest = {
	userId: "guest",
	name: "Guest",
	role: "member",
	weight: 1,
	isGuest: true,
	claimedAt: null,
};
const target = {
	...guest,
	userId: "me",
	name: "Me",
	role: "owner",
	isGuest: false,
};
const group = {
	name: "Disposable",
	myRole: "owner",
	archivedAt: null,
	members: [guest, target],
};
const viewer = { id: "me", emailVerified: true, isGuest: false };
const problem = (g = group, v = viewer, from = "guest", to = "me") =>
	guestMergeProblem(g, v, from, to);

describe("guest merge permissions and selection", () => {
	test("only owner/admin in active groups may start", () => {
		for (const role of ["owner", "admin"]) {
			expect(canStartGuestMerge({ ...group, myRole: role })).toBe(true);
			expect(problem({ ...group, myRole: role })).toBeNull();
		}
		for (const role of ["member", "unknown", ""]) {
			expect(canStartGuestMerge({ ...group, myRole: role })).toBe(false);
			expect(problem({ ...group, myRole: role })).toContain(
				"owners and admins",
			);
		}
		expect(problem({ ...group, archivedAt: "2026-10-12" })).toContain(
			"Unarchive",
		);
	});
	test("source must be another ordinary, unclaimed guest", () => {
		expect(isMergeSource(guest, "me")).toBe(true);
		for (const change of [
			{ isGuest: false },
			{ claimedAt: "claimed" },
			{ role: "admin" },
			{ role: "owner" },
			{ userId: "me" },
		])
			expect(isMergeSource({ ...guest, ...change }, "me")).toBe(false);
	});
	test("no missing, removed, self or registered source", () => {
		expect(problem(group, viewer, "")).toContain("Choose a guest");
		expect(problem(group, viewer, "removed")).toContain("no longer");
		expect(problem(group, viewer, "guest", "guest")).toContain("different");
		expect(problem(group, viewer, "me", "guest")).toContain("unclaimed guest");
	});
	test("target is only the signed-in verified registered account", () => {
		expect(problem(group, viewer, "guest", "")).toContain("Choose the account");
		expect(problem(group, viewer, "guest", "removed")).toContain("no longer");
		const other = { ...target, userId: "other" };
		expect(
			problem(
				{ ...group, members: [...group.members, other] },
				viewer,
				"guest",
				"other",
			),
		).toContain("signed-in account holder");
		expect(problem(group, { ...viewer, emailVerified: false })).toContain(
			"verified email",
		);
		expect(problem(group, { ...viewer, isGuest: true })).toContain(
			"registered",
		);
		expect(problem(group, null)).toContain("Sign in again");
	});
	test("known weight conflict blocks review", () => {
		expect(
			problem({ ...group, members: [{ ...guest, weight: 2 }, target] }),
		).toContain("weights differ");
	});
});

test("review snapshot detects relevant changes without dropping selection", () => {
	const key = guestMergeReviewKey(group, viewer, "guest", "me");
	const changed = [
		{ ...group, name: "Renamed" },
		{ ...group, myRole: "member" },
		{ ...group, archivedAt: "archived" },
		{ ...group, members: [target] },
		...[
			{ name: "Renamed guest" },
			{ weight: 2 },
			{ role: "admin" },
			{ isGuest: false },
			{ claimedAt: "claimed" },
		].map((change) => ({
			...group,
			members: [{ ...guest, ...change }, target],
		})),
	];
	for (const next of changed)
		expect(guestMergeReviewKey(next, viewer, "guest", "me")).not.toBe(key);
	for (const change of [
		{ id: "other" },
		{ emailVerified: false },
		{ isGuest: true },
	])
		expect(
			guestMergeReviewKey(group, { ...viewer, ...change }, "guest", "me"),
		).not.toBe(key);
	// Another unrelated member joining does not alter the reviewed facts.
	const unrelated = { ...target, userId: "unrelated" };
	expect(
		guestMergeReviewKey(
			{ ...group, members: [...group.members, unrelated] },
			viewer,
			"guest",
			"me",
		),
	).toBe(key);
});
