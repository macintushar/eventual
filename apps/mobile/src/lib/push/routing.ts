import { type PushData, pushDataSchema } from "@eventual/schemas/push";

/**
 * Where a notification tap can ask to go. The list mirrors the server's payload
 * (apps/web PUSH.md): only `origin`, `userId`, `groupId`, optional `expenseId`
 * and a type — no financial content, so the app always refetches with its own
 * authorization (docs/mobile-design 04 §7, 05 decisions §B).
 */
export type PushDestination =
	| { kind: "expense"; groupId: string; expenseId: string }
	| { kind: "group"; groupId: string };

export type TapContext = { origin: string; userId: string };

/**
 * Pure: turns notification data into a destination, or null when it must not
 * be followed (unparseable, a different server, or a different account; the
 * session-level "not signed in yet" case is handled by `stagePendingTap`).
 */
export function resolvePushDestination(
	data: unknown,
	context: TapContext,
): PushDestination | null {
	const parsed = pushDataSchema.safeParse(data);
	if (!parsed.success) return null;
	const { origin, userId, groupId, expenseId } = parsed.data;
	// Never cross servers or accounts.
	if (origin !== context.origin || userId !== context.userId) return null;
	return expenseId
		? { kind: "expense", groupId, expenseId }
		: { kind: "group", groupId };
}

/** What navigation learned about the target's accessibility. */
export type TapAccess = "granted" | "missing" | "error";

/**
 * Pure: resolves whether the route can still be taken as designed. A deleted
 * expense goes to the group's activity; a group the user can't reach goes back
 * to the dashboard, without passing any stale identifiers deeper into the app.
 */
export function destinationAfterAccess(
	destination: PushDestination,
	access: {
		expense: TapAccess;
		group: TapAccess;
	},
): PushDestination | { kind: "home" } {
	if (destination.kind === "group")
		return access.group === "granted" ? destination : { kind: "home" };
	if (access.expense === "granted") return destination;
	// Deleted (404) or any other failure: fall back to the group activity, or
	// home when the group itself is out of reach.
	return access.group === "granted"
		? { kind: "group", groupId: destination.groupId }
		: { kind: "home" };
}

/** A tap held back until a session exists. */
export type PendingTap = {
	/** The payload's own origin, which the tap-time server was checked against. */
	origin: string;
	payload: PushData;
};

/**
 * Pure: while signed out, a tap can only be held for the server the app
 * already points at. A notification for another server is dropped outright.
 */
export function stagePendingTap(
	data: unknown,
	session: { origin: string },
): PendingTap | null {
	const parsed = pushDataSchema.safeParse(data);
	if (!parsed.success) return null;
	if (parsed.data.origin !== session.origin) return null;
	return { origin: session.origin, payload: parsed.data };
}

/**
 * Pure: decides whether a pending tap may fire after sign-in. It must match
 * both the session's origin and its signed-in user, so a destination cannot
 * cross accounts or servers while waiting in memory.
 */
export function consumePendingTap(
	pending: PendingTap | null,
	session: { origin: string; userId: string | null },
): PushDestination | null {
	if (!pending || !session.userId) return null;
	if (session.origin !== pending.origin) return null;
	if (pending.payload.userId !== session.userId) return null;
	const { groupId, expenseId } = pending.payload;
	return expenseId
		? { kind: "expense", groupId, expenseId }
		: { kind: "group", groupId };
}
