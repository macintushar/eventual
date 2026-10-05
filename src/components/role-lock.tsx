import { Lock } from "lucide-react";

import { type Permissions, whoCan } from "#/lib/permissions";
import { cn } from "#/lib/utils";

/**
 * How the UI answers "your role can't do this", in three tiers:
 *
 * - **Hide** per-item affordances (a trash icon on every row, a manage menu).
 *   Repeating a lock on each row is noise, and the row reads fine without it.
 * - **Lock** a capability that lives in one place, like a settings row. The
 *   row stays so people learn the feature exists, and the lock says who to ask.
 * - **Explain** a whole region the role can't use with one line in place of
 *   its controls, rather than a page of disabled inputs.
 *
 * The wording comes from `whoCan`, which reads the role definitions the server
 * enforces, so the copy can't promise access the server would refuse.
 */
export function RoleLock({
	permissions,
	action,
	className,
}: {
	permissions: Permissions;
	/** Name the action when nearby text doesn't: "add people". */
	action?: string;
	className?: string;
}) {
	const who = whoCan(permissions).replace(/^Only (the )?/, "");
	const text = action ? `${who} can ${action}` : `${who} only`;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground",
				className,
			)}
		>
			<Lock className="size-3" aria-hidden />
			{text.charAt(0).toUpperCase() + text.slice(1)}
		</span>
	);
}

/** One line standing in for controls the viewer's role can't use. */
export function RoleNote({
	permissions,
	children,
	className,
}: {
	permissions: Permissions;
	/** What the role allows, finishing the sentence "Only owners and admins can …". */
	children: string;
	className?: string;
}) {
	return (
		<p
			className={cn(
				"flex items-start gap-2 text-sm text-pretty text-muted-foreground",
				className,
			)}
		>
			<Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
			<span>
				{whoCan(permissions)} can {children}.
			</span>
		</p>
	);
}
