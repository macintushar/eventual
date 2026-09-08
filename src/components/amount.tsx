import { formatMinor } from "#/lib/money";
import { cn } from "#/lib/utils";

/**
 * Money is rendered in exactly one place so sign colouring, tabular figures and
 * INR formatting stay consistent across dashboards, balances and expense rows.
 */
export function Amount({
	minor,
	tone = "plain",
	className,
}: {
	minor: number;
	/** `signed` colours by sign (owed to you / you owe); `plain` inherits colour. */
	tone?: "plain" | "signed";
	className?: string;
}) {
	return (
		<span
			className={cn(
				"tabular",
				tone === "signed" &&
					(minor > 0
						? "text-positive"
						: minor < 0
							? "text-negative"
							: "text-muted-foreground"),
				className,
			)}
		>
			{formatMinor(minor)}
		</span>
	);
}
