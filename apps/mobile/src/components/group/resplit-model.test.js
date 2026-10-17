import { describe, expect, test } from "bun:test";
import { fromMinor } from "@eventual/schemas/money";
import { computeShares } from "@eventual/schemas/split";
import {
	assertReviewUnchanged,
	buildResplitInput,
	canResplit,
	RESPLIT_LIMIT,
	resplitResultComplete,
	reviewResplit,
	validateSelection,
} from "./resplit-model";

const group = {
	myRole: "owner",
	archivedAt: null,
	members: [
		{ userId: "a", name: "A", weight: 2 },
		{ userId: "b", name: "B", weight: 1 },
	],
};
const row = {
	id: "e",
	organizationId: "g",
	description: "Lunch",
	amountMinor: 1001,
	currency: "INR",
	locked: false,
};
const draft = { method: "even", memberIds: ["b", "a"], values: {} };

function fixture(changes = {}) {
	const detail = { ...row, updatedAt: "2026-10-12", shares: [], ...changes };
	const calls = [];
	const api = {
		call: async (name, input) => {
			calls.push(name);
			if (name === "app.groupContext") return { group };
			if (name === "expense.get") return detail;
			if (name === "expense.preview")
				return computeShares(
					input.amountMinor,
					input.splitMethod,
					input.participants,
					input.currency,
				);
			throw new Error(`Unexpected write: ${name}`);
		},
	};
	return { api, calls, detail };
}

describe("bounded bulk re-split", () => {
	test("only owners/admins in active groups can enter or preview", () => {
		for (const myRole of ["owner", "admin", "member"]) {
			expect(canResplit({ ...group, myRole })).toBe(myRole !== "member");
			expect(canResplit({ ...group, myRole, archivedAt: "2026-10-12" })).toBe(
				false,
			);
		}
		for (const restricted of [
			{ ...group, myRole: "member" },
			{ ...group, archivedAt: "now" },
		])
			expect(() => buildResplitInput("g", restricted, [row], draft)).toThrow();
	});
	test("selection rejects locks, foreign/deleted scope, duplicates, empty and over 100", () => {
		for (const rows of [
			[],
			[row, row],
			[{ ...row, locked: true }],
			[{ ...row, organizationId: "other" }],
			Array.from({ length: 101 }, (_, i) => ({ ...row, id: `${i}` })),
		])
			expect(() => validateSelection("g", rows)).toThrow();
		expect(() =>
			validateSelection(
				"g",
				Array.from({ length: RESPLIT_LIMIT }, (_, i) => ({
					...row,
					id: `${i}`,
				})),
			),
		).not.toThrow();
	});
	test("excludes Exact and rejects stale/duplicate members and invalid currency totals", () => {
		for (const change of [
			{ method: "exact" },
			{ memberIds: [] },
			{ memberIds: ["gone"] },
			{ memberIds: ["a", "a"] },
		])
			expect(() =>
				buildResplitInput("g", group, [row], { ...draft, ...change }),
			).toThrow();
		for (const change of [
			{ amountMinor: 0 },
			{ amountMinor: -1 },
			{ amountMinor: 1.1 },
			{ amountMinor: Number.MAX_SAFE_INTEGER + 1 },
			{ currency: "FAKE" },
		])
			expect(() =>
				buildResplitInput("g", group, [{ ...row, ...change }], draft),
			).toThrow();
	});
	test("trusted weights and deterministic rounding preserve 0/2/3 decimal currencies", () => {
		for (const [currency, amountMinor, expected, text] of [
			["INR", 1001, [667, 334], "10.01"],
			["JPY", 5, [3, 2], "5"],
			["KWD", 1234, [823, 411], "1.234"],
		]) {
			const { previews } = buildResplitInput(
				"g",
				group,
				[{ ...row, currency, amountMinor }],
				draft,
			);
			expect(previews[0].shares.map((s) => s.amountMinor)).toEqual(expected);
			expect(
				previews[0].shares.reduce((sum, s) => sum + s.amountMinor, 0),
			).toBe(amountMinor);
			expect(fromMinor(amountMinor, currency)).toBe(text);
		}
	});
	test("shares accept only safe nonnegative integers with a positive sum", () => {
		for (const value of [
			"",
			"-1",
			"1.5",
			"1e2",
			"NaN",
			"9,000",
			"9007199254740992",
		])
			expect(() =>
				buildResplitInput("g", group, [row], {
					...draft,
					method: "shares",
					values: { a: value, b: "1" },
				}),
			).toThrow();
		expect(() =>
			buildResplitInput("g", group, [row], {
				...draft,
				method: "shares",
				values: { a: "0", b: "0" },
			}),
		).toThrow();
		const { previews } = buildResplitInput("g", group, [row], {
			...draft,
			method: "shares",
			values: { a: "1", b: "1" },
		});
		expect(previews[0].shares.map((s) => s.amountMinor)).toEqual([501, 500]);
		// Reject intermediate multiplication overflow rather than silently rounding.
		expect(() =>
			buildResplitInput(
				"g",
				group,
				[{ ...row, amountMinor: Number.MAX_SAFE_INTEGER }],
				draft,
			),
		).toThrow();
	});
	test("percent basis points are currency independent, total exactly 100%, never rounded inputs", () => {
		for (const currency of ["JPY", "INR", "KWD"]) {
			const { input, previews } = buildResplitInput(
				"g",
				group,
				[{ ...row, currency, amountMinor: 7 }],
				{ ...draft, method: "percent", values: { a: "33.33", b: "66.67" } },
			);
			expect(input.participants.map((p) => p.input)).toEqual([6667, 3333]);
			expect(previews[0].shares.map((s) => s.amountMinor)).toEqual([2, 5]);
		}
		for (const a of ["33.333", "33,33", "-1", "101", "33.32", "33.34"])
			expect(() =>
				buildResplitInput("g", group, [row], {
					...draft,
					method: "percent",
					values: { a, b: "66.67" },
				}),
			).toThrow();
	});
	test("server-checked preview fetches detail and never writes", async () => {
		const { api, calls } = fixture();
		const review = await reviewResplit(api, "g", [row], draft);
		expect(calls).toEqual([
			"app.groupContext",
			"expense.get",
			"expense.preview",
		]);
		expect(review.previews[0].shares.map((s) => s.amountMinor)).toEqual([
			667, 334,
		]);
		const fresh = await reviewResplit(api, "g", [row], draft);
		expect(() => assertReviewUnchanged(review, fresh)).not.toThrow();
	});
	test("100-expense preview bounds simultaneous requests to five", async () => {
		let active = 0;
		let peak = 0;
		const api = {
			call: async (name, input) => {
				active++;
				peak = Math.max(peak, active);
				await Promise.resolve();
				active--;
				if (name === "app.groupContext") return { group };
				if (name === "expense.get")
					return { ...row, id: input.expenseId, shares: [], updatedAt: "now" };
				if (name === "expense.preview")
					return computeShares(
						input.amountMinor,
						input.splitMethod,
						input.participants,
						input.currency,
					);
				throw new Error("Preview must never mutate");
			},
		};
		const selected = Array.from({ length: 100 }, (_, i) => ({
			...row,
			id: `${i}`,
		}));
		const review = await reviewResplit(api, "g", selected, draft);
		expect(review.previews).toHaveLength(100);
		expect(peak).toBe(5);
	});
	test("fresh role, archive, and member changes block preview", async () => {
		const { api } = fixture();
		for (const restricted of [
			{ ...group, myRole: "member" },
			{ ...group, archivedAt: "now" },
			{ ...group, members: [group.members[0]] },
		]) {
			const freshApi = {
				call: (name, input) =>
					name === "app.groupContext"
						? Promise.resolve({ group: restricted })
						: api.call(name, input),
			};
			await expect(
				reviewResplit(freshApi, "g", [row], draft),
			).rejects.toThrow();
		}
	});
	test("fresh reads reject changed totals, locks, deletions, and divergent server weights", async () => {
		for (const changes of [
			{ amountMinor: 500 },
			{ currency: "JPY" },
			{ locked: true },
			{ organizationId: "other" },
		])
			await expect(
				reviewResplit(fixture(changes).api, "g", [row], draft),
			).rejects.toThrow();
		await expect(
			reviewResplit(
				{
					call: async () => {
						throw new Error("NOT_FOUND");
					},
				},
				"g",
				[row],
				draft,
			),
		).rejects.toThrow("NOT_FOUND");
		const { api } = fixture();
		const divergent = {
			call: (name, input) =>
				name === "expense.preview"
					? Promise.resolve([
							{ userId: "a", amountMinor: 500 },
							{ userId: "b", amountMinor: 501 },
						])
					: api.call(name, input),
		};
		await expect(reviewResplit(divergent, "g", [row], draft)).rejects.toThrow(
			"weights changed",
		);
	});
	test("apply preflight rejects changes to reviewed details, shares or weights", async () => {
		const { api, detail } = fixture();
		const review = await reviewResplit(api, "g", [row], draft);
		detail.updatedAt = "later";
		const changed = await reviewResplit(api, "g", [row], draft);
		expect(() => assertReviewUnchanged(review, changed)).toThrow(
			"Preview again",
		);
		const weightedGroup = {
			...group,
			members: group.members.map((m) => ({ ...m, weight: 1 })),
		};
		const weightedApi = {
			call: (name, input) =>
				name === "app.groupContext"
					? Promise.resolve({ group: weightedGroup })
					: api.call(name, input),
		};
		const weighted = await reviewResplit(weightedApi, "g", [row], draft);
		expect(() => assertReviewUnchanged(review, weighted)).toThrow();
	});
	test("partial results cannot masquerade as full success; every ID must be accounted for", () => {
		expect(
			resplitResultComplete(["a", "b"], {
				successes: [{ expenseId: "a" }],
				skips: [{ expenseId: "b", code: "EXPENSE_LOCKED", reason: "Paid" }],
			}),
		).toBe(true);
		for (const successes of [
			[],
			[{ expenseId: "a" }],
			[{ expenseId: "a" }, { expenseId: "a" }],
			[{ expenseId: "a" }, { expenseId: "foreign" }],
		])
			expect(resplitResultComplete(["a", "b"], { successes, skips: [] })).toBe(
				false,
			);
	});
});
