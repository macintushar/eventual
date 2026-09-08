import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "#/components/app-shell";
import { getSessionFn } from "#/server/fn/auth";

export const Route = createFileRoute("/app")({
	beforeLoad: async ({ location }) => {
		const auth = await getSessionFn();
		if (!auth)
			throw redirect({ to: "/login", search: { redirect: location.href } });
		return auth;
	},
	component: AppLayout,
});

function AppLayout() {
	const { user } = Route.useRouteContext();
	return (
		<AppShell user={user}>
			<Outlet />
		</AppShell>
	);
}
