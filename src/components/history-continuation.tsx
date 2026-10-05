import { useEffect, useRef } from "react";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";

type HistoryQuery = {
	hasNextPage: boolean;
	isFetching: boolean;
	isError: boolean;
	isFetchNextPageError: boolean;
	fetchNextPage: (options: { cancelRefetch: boolean }) => Promise<unknown>;
	refetch: () => Promise<unknown>;
};

/**
 * The same guarded continuation for mouse, keyboard and near-viewport loading.
 * `label` names the list in the error line, e.g. "Couldn't load more payments."
 */
export function HistoryContinuation({
	query,
	label = "history",
}: {
	query: HistoryQuery;
	label?: string;
}) {
	const sentinel = useRef<HTMLDivElement>(null);
	const { hasNextPage, isFetching, isError, fetchNextPage } = query;
	useEffect(() => {
		if (
			!sentinel.current ||
			!hasNextPage ||
			isFetching ||
			isError ||
			typeof IntersectionObserver === "undefined"
		)
			return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					observer.disconnect();
					void fetchNextPage({ cancelRefetch: false });
				}
			},
			{ rootMargin: "600px 0px" },
		);
		observer.observe(sentinel.current);
		return () => observer.disconnect();
	}, [hasNextPage, isFetching, isError, fetchNextPage]);
	return (
		<div
			ref={sentinel}
			className="flex min-h-16 items-center justify-center gap-3"
			aria-live="polite"
		>
			{isError ? (
				<span className="text-sm text-muted-foreground">
					{query.isFetchNextPageError
						? `Couldn't load more ${label}.`
						: `Couldn't load ${label}.`}
				</span>
			) : null}
			{hasNextPage || isError ? (
				<Button
					variant="outline"
					disabled={isFetching}
					onClick={() => {
						if (isFetching) return;
						void (isError && !query.isFetchNextPageError
							? query.refetch()
							: fetchNextPage({ cancelRefetch: false }));
					}}
				>
					{isFetching ? <Spinner data-icon="inline-start" /> : null}
					{isFetching ? "Loading…" : isError ? "Try again" : "Load more"}
				</Button>
			) : null}
		</div>
	);
}
