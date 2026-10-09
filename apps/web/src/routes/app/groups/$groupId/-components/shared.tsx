import type { LucideIcon } from "lucide-react";
import { CircleAlert } from "lucide-react";
import { EmptyState } from "#/components/empty-state";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import type { useAppMutation } from "#/lib/app-mutation";
import type {
	getGroupContextFn,
	getGroupSummaryFn,
} from "#/lib/web-api-client";
import type { MutationInput } from "#/server/operations";

export type LoaderData = Awaited<ReturnType<typeof getGroupContextFn>> &
	Awaited<ReturnType<typeof getGroupSummaryFn>>;
export type Run = (action: MutationInput, message: string) => Promise<boolean>;
export type Execute = ReturnType<typeof useAppMutation>["execute"];

/* ------------------------------------------------------- Loading and errors */

/** The one loading line every tab and list on this page uses. */
export function Loading({ label }: { label: string }) {
	return (
		<p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
			<Spinner />
			{label}
		</p>
	);
}

/**
 * The one failure state every tab and list on this page uses: what didn't
 * load, why, and a way to try again — in place of the content, never as well
 * as a toast or an empty message.
 */
export function LoadError({
	icon = CircleAlert,
	title,
	query,
}: {
	icon?: LucideIcon;
	title: string;
	query: { error: unknown; isFetching: boolean; refetch: () => unknown };
}) {
	return (
		<EmptyState
			role="alert"
			icon={icon}
			title={title}
			description={
				query.error instanceof Error && query.error.message
					? query.error.message
					: "Something went wrong on the way. Nothing was changed."
			}
			action={
				<Button
					variant="outline"
					disabled={query.isFetching}
					onClick={() => void query.refetch()}
				>
					{query.isFetching ? <Spinner data-icon="inline-start" /> : null}
					Try again
				</Button>
			}
		/>
	);
}
