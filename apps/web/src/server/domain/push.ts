import type { PushData, PushPreferences } from "@eventual/schemas/push";
import type { Recipient } from "./activity";

export const defaultPushPreferences: PushPreferences = {
	expenses: true,
	payments: true,
	recurring: true,
	mutedGroupIds: [],
};

export function pushCategory(
	type: PushData["type"],
): "expenses" | "payments" | "recurring" {
	return type === "recurring.generated"
		? "recurring"
		: type.startsWith("expense.")
			? "expenses"
			: "payments";
}

export function wantsPush(
	preferences: PushPreferences,
	groupId: string,
	type: PushData["type"],
) {
	return (
		preferences[pushCategory(type)] &&
		!preferences.mutedGroupIds.includes(groupId)
	);
}

export function pushRecipients(
	recipients: Recipient[],
	actorUserId: string,
	groupId: string,
	type: PushData["type"],
	preferences: Map<string, PushPreferences>,
) {
	return [...new Set(recipients.map((row) => row.userId))].filter(
		(userId) =>
			userId !== actorUserId &&
			wantsPush(
				preferences.get(userId) ?? defaultPushPreferences,
				groupId,
				type,
			),
	);
}

export function pushCopy(type: PushData["type"], actor: string, group: string) {
	// User-controlled names are bounded so the provider payload stays below 4KB.
	actor = [...actor].slice(0, 100).join("");
	group = [...group].slice(0, 100).join("");
	switch (type) {
		case "expense.created":
			return `${actor} added an expense in ${group}.`;
		case "expense.updated":
			return `${actor} updated an expense in ${group}.`;
		case "expense.deleted":
			return `${actor} deleted an expense in ${group}.`;
		case "settlement.created":
			return `${actor} recorded a payment in ${group}.`;
		case "settlement.deleted":
			return `${actor} deleted a payment in ${group}.`;
		case "share.marked_paid":
			return `${actor} marked a share paid in ${group}.`;
		case "share.marked_unpaid":
			return `${actor} marked a share unpaid in ${group}.`;
		case "recurring.generated":
			return `A recurring expense was added in ${group}.`;
	}
}
