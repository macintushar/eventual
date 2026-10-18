import { describe, expect, test } from "bun:test";
import {
	defaultPreferences,
	fillPreferences,
	isGroupMuted,
	mutedAfterToggle,
} from "./preferences";

describe("push preferences", () => {
	test("server defaults: every category on, nothing muted", () => {
		expect(fillPreferences(null)).toEqual(defaultPreferences);
		expect(fillPreferences(undefined)).toEqual(defaultPreferences);
	});

	test("partial merges keep other categories untouched", () => {
		expect(fillPreferences({ payments: false })).toEqual({
			expenses: true,
			payments: false,
			recurring: true,
			mutedGroupIds: [],
		});
	});

	test("mute lookups tolerate missing lists", () => {
		expect(
			isGroupMuted({ ...defaultPreferences, mutedGroupIds: ["g/2"] }, "g/2"),
		).toBe(true);
		expect(isGroupMuted(defaultPreferences, "g/2")).toBe(false);
	});

	test("muting appends, deduplicates and keeps a stable order", () => {
		expect(
			mutedAfterToggle(
				{ ...defaultPreferences, mutedGroupIds: ["g/9"] },
				"g/1",
				true,
			),
		).toEqual(["g/1", "g/9"]);
		expect(
			mutedAfterToggle(
				{ ...defaultPreferences, mutedGroupIds: ["g/1"] },
				"g/1",
				true,
			),
		).toEqual(["g/1"]);
	});

	test("unmuting removes the group and leaves the rest", () => {
		expect(
			mutedAfterToggle(
				{ ...defaultPreferences, mutedGroupIds: ["g/1", "g/2"] },
				"g/1",
				false,
			),
		).toEqual(["g/2"]);
		expect(
			mutedAfterToggle(
				{ ...defaultPreferences, mutedGroupIds: [] },
				"g/1",
				false,
			),
		).toEqual([]);
	});
});
