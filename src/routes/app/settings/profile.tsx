import { createFileRoute } from "@tanstack/react-router";

import { ProfileSettings } from "#/components/profile-settings";

export const Route = createFileRoute("/app/settings/profile")({
	head: () => ({ meta: [{ title: "Profile · Eventual" }] }),
	component: ProfilePage,
});

function ProfilePage() {
	const { user } = Route.useRouteContext();
	return <ProfileSettings user={user} />;
}
