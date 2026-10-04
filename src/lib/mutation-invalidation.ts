import type { QueryClient } from "@tanstack/react-query";
import type { MutationInput } from "#/server/operations";

function field(value: unknown, key: string): string | undefined {
	if (!value || typeof value !== "object") return;
	const item = (value as Record<string, unknown>)[key];
	return typeof item === "string" ? item : undefined;
}

export async function invalidateForMutation(
	client: QueryClient,
	data: MutationInput,
	result?: unknown,
) {
	const name = data.action;
	const groupIds = new Set(
		[
			field(data.input, "groupId"),
			field(result, "groupId"),
			field(result, "organizationId"),
			name.startsWith("group.") ? field(result, "id") : undefined,
		].filter((id): id is string => Boolean(id)),
	);
	const expenseId = field(data.input, "expenseId");
	const cached = expenseId
		? client.getQueryData(["expense", expenseId])
		: undefined;
	const cachedGroup = field(cached, "organizationId");
	if (cachedGroup) groupIds.add(cachedGroup);
	const financial = /^(expense|share|settlement)\./.test(name);
	const membership = /^(group|member|invitation)\./.test(name);
	const resources = new Set<string>();
	if (financial) {
		resources.add("financial-summary");
		resources.add("expenses");
		resources.add("activity");
		if (name.startsWith("settlement.")) resources.add("settlements");
	}
	if (name.startsWith("category.") || name.startsWith("reminder."))
		resources.add("settings");
	if (name.startsWith("category.")) resources.add("expenses");
	if (name.startsWith("recurring.")) resources.add("recurring");
	// Legacy aggregate reads remain compatible while other clients migrate.
	resources.add("page");
	const affected = client
		.getQueryCache()
		.findAll()
		.filter((query) => {
			const [root, id, resource] = query.queryKey;
			if (root === "dashboard") return financial || membership;
			if (root === "composer" || root === "groups") return membership;
			if (root === "activity") return financial || membership;
			if (root === "invitation")
				return (
					name.startsWith("invitation.") ||
					name === "member.add" ||
					name === "member.updateGuest"
				);
			if (root === "session") return name === "reminder.preferences.update";
			if (root === "expense")
				return (
					id === expenseId ||
					((financial || membership) &&
						groupIds.has(field(query.state.data, "organizationId") ?? ""))
				);
			if (root !== "group" || !groupIds.has(String(id))) return false;
			return membership || resources.has(String(resource));
		});
	await Promise.all(
		// Refetch what's on screen, loaded pages included: there is no refresh
		// button, so a row you just deleted must not linger in older pages.
		affected.map((query) =>
			client.invalidateQueries({
				queryKey: query.queryKey,
				exact: true,
				refetchType: "active",
			}),
		),
	);
}
