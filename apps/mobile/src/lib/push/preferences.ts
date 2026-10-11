/**
 * Pure parts of the push preference screens. The server owns the canonical
 * record (packages/schemas/src/push.ts); these helpers only shape what the
 * app sends for the partial PATCH and what it renders.
 */
export type PushPreferences = {
	expenses: boolean;
	payments: boolean;
	recurring: boolean;
	mutedGroupIds: string[];
};

/** Server defaults (apps/web push service): every category on, nothing muted. */
export const defaultPreferences: PushPreferences = {
	expenses: true,
	payments: true,
	recurring: true,
	mutedGroupIds: [],
};

export function fillPreferences(
	preferences: Partial<PushPreferences> | null | undefined,
): PushPreferences {
	return {
		expenses: preferences?.expenses ?? defaultPreferences.expenses,
		payments: preferences?.payments ?? defaultPreferences.payments,
		recurring: preferences?.recurring ?? defaultPreferences.recurring,
		mutedGroupIds:
			preferences?.mutedGroupIds ?? defaultPreferences.mutedGroupIds,
	};
}

export function isGroupMuted(
	preferences: PushPreferences | null | undefined,
	groupId: string,
): boolean {
	return (preferences?.mutedGroupIds ?? []).includes(groupId);
}

/**
 * Muting is per group; `mutedGroupIds`' replacement must be supplied whole
 * on PATCH, so one add/remove produces the next complete list. Stable order
 * keeps the update independent of fetch ordering (and testable).
 */
export function mutedAfterToggle(
	preferences: PushPreferences | null | undefined,
	groupId: string,
	muted: boolean,
): string[] {
	const current = new Set(preferences?.mutedGroupIds ?? []);
	if (muted) current.add(groupId);
	else current.delete(groupId);
	return [...current].sort();
}
