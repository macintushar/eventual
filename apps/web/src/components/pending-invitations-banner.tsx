import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Mail } from "lucide-react";

import { Button } from "#/components/ui/button";
import { myInvitationsQueryOptions, sessionQueryOptions } from "#/lib/queries";

/**
 * Invitations wait on every signed-in page, not only the dashboard. Someone
 * who lands on their profile after verifying still sees the group they came
 * to join.
 */
export function PendingInvitationsBanner() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	// Signing out clears the cache before leaving the page; refetching then
	// would 401 and bounce to the login page instead of the home page.
	const { data: session } = useQuery({
		...sessionQueryOptions,
		enabled: !import.meta.env.SSR,
	});
	const { data } = useQuery({
		...myInvitationsQueryOptions,
		enabled: !import.meta.env.SSR && Boolean(session?.user),
	});
	// The dashboard lists them in full.
	if (!data?.length || pathname === "/app" || pathname === "/app/") return null;
	const [first] = data;
	return (
		<div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm sm:mb-6">
			<Mail className="size-4 shrink-0 text-primary" aria-hidden="true" />
			<p className="min-w-0 flex-1">
				<strong className="font-semibold">{first.inviterName}</strong> invited
				you to <strong className="font-semibold">{first.groupName}</strong>
				{data.length > 1 ? ` and ${data.length - 1} more` : ""}.
			</p>
			<Button size="sm" asChild>
				{data.length > 1 ? (
					<Link to="/app">Review invitations</Link>
				) : (
					<Link
						to="/invite/$invitationId"
						params={{ invitationId: first.invitation.id }}
					>
						Review
					</Link>
				)}
			</Button>
		</div>
	);
}
