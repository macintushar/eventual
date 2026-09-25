import { createFileRoute } from "@tanstack/react-router";

import { LinkedAccounts } from "#/components/linked-accounts";
import { ProfileSettings } from "#/components/profile-settings";

export const Route = createFileRoute("/app/settings/profile")({
	head: () => ({ meta: [{ title: "Profile · Eventual" }] }),
	component: ProfilePage,
});

function ProfilePage() {
	const { user } = Route.useRouteContext();
	return (
		<div className="flex flex-col gap-5 sm:gap-6">
			<ProfileSettings user={user} />
			<LinkedAccounts />
		</div>
	);
}
