import { createFileRoute } from "@tanstack/react-router";

import { LinkedAccounts } from "#/components/linked-accounts";
import { ProfileSettings } from "#/components/profile-settings";
import { siteQueryOptions } from "#/lib/queries";

export const Route = createFileRoute("/app/settings/profile")({
	head: () => ({ meta: [{ title: "Profile · Eventual" }] }),
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(siteQueryOptions),
	component: ProfilePage,
});

function ProfilePage() {
	const { user } = Route.useRouteContext();
	return (
		<div className="flex flex-col gap-8 sm:gap-10">
			<ProfileSettings user={user} />
			<LinkedAccounts />
		</div>
	);
}
