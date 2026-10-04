import assert from "node:assert/strict";
import { test } from "node:test";
import {
	InfiniteQueryObserver,
	QueryClient,
	QueryObserver,
} from "@tanstack/react-query";
import { invalidateForMutation } from "./mutation-invalidation";

test("financial writes refresh only affected groups and never a disabled composer", async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { staleTime: Infinity, retry: false } },
	});
	const calls: string[] = [];
	const cleanups: (() => void)[] = [];
	try {
		for (const key of [
			["group", "G", "financial-summary"],
			["group", "other", "financial-summary"],
			["group", "G", "settings"],
			["composer"],
			["dashboard"],
		]) {
			const observer = new QueryObserver(client, {
				queryKey: key,
				initialData: {},
				enabled: key[0] !== "composer",
				queryFn: async () => {
					calls.push(key.join("/"));
					return {};
				},
			});
			cleanups.push(observer.subscribe(() => {}));
		}
		await invalidateForMutation(
			client,
			{ action: "expense.delete", input: { expenseId: "E" } },
			{ groupId: "G" },
		);
		assert.deepEqual(calls.sort(), ["dashboard", "group/G/financial-summary"]);
		calls.length = 0;
		await invalidateForMutation(client, {
			action: "category.delete",
			input: { groupId: "G", ruleId: "R" },
		});
		assert.deepEqual(calls, ["group/G/settings"]);
	} finally {
		for (const cleanup of cleanups) cleanup();
		client.clear();
	}
});

test("a write refetches every loaded page of an on-screen history", async () => {
	const client = new QueryClient();
	let requests = 0;
	const key = ["group", "G", "expenses"];
	const observer = new InfiniteQueryObserver(client, {
		queryKey: key,
		staleTime: Infinity,
		initialPageParam: "first",
		getNextPageParam: () => "next",
		initialData: {
			pages: [{ items: [1] }, { items: [2] }],
			pageParams: ["first", "next"],
		},
		queryFn: async () => {
			requests++;
			return { items: [3] };
		},
	});
	const unsubscribe = observer.subscribe(() => {});
	try {
		await invalidateForMutation(
			client,
			{ action: "expense.delete", input: { expenseId: "E" } },
			{ groupId: "G" },
		);
		// Both loaded pages come back, so a deleted row on either one is gone.
		assert.equal(requests, 2);
		assert.equal(observer.getCurrentResult().data?.pages.length, 2);
	} finally {
		unsubscribe();
		client.clear();
	}
});
