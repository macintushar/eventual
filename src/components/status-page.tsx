import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight } from "lucide-react";
import { siteQueryOptions } from "#/lib/queries";
import { cn } from "#/lib/utils";

/** Public status site from `STATUS_PAGE_URL`. Null when this instance hasn't set one. */
export function useStatusPageUrl() {
	const site = useQuery(siteQueryOptions);
	return site.data?.statusPageUrl ?? null;
}

/**
 * Link to this instance's status page. Hidden when `STATUS_PAGE_URL` is unset,
 * so a self-hosted copy without a status site stays unchanged.
 */
export function StatusPageCallout({ className }: { className?: string }) {
	const href = useStatusPageUrl();
	if (!href) return null;

	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			aria-label="Service status, opens in a new tab"
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-foreground no-underline outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
				className,
			)}
		>
			<Activity className="size-3.5" aria-hidden="true" />
			Status
			<ArrowUpRight className="size-3" aria-hidden="true" />
		</a>
	);
}

/** Shown on the error screen, where a footer link is easy to miss. */
export function StatusPagePrompt({ className }: { className?: string }) {
	const href = useStatusPageUrl();
	if (!href) return null;

	return (
		<p className={cn("text-sm text-balance text-muted-foreground", className)}>
			If this keeps happening,{" "}
			<a
				href={href}
				target="_blank"
				rel="noreferrer"
				className="font-medium text-foreground underline"
			>
				check the status page
			</a>
			.
		</p>
	);
}
