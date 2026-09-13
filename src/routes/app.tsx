import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AnalyticsIdentity } from "#/components/analytics-provider";
import { AppShell } from "#/components/app-shell";
import { loadSession } from "#/lib/session";

export const Route = createFileRoute("/app")({
	beforeLoad: async ({ location }) => {
		const auth = await loadSession();
		if (!auth)
			throw redirect({ to: "/login", search: { redirect: location.href } });
		return auth;
	},
	component: AppLayout,
});

function AppLayout() {
	const { user } = Route.useRouteContext();
	return (
		<>
			<AnalyticsIdentity userId={user.id} />
			<AppShell user={user}>
				<Outlet />
			</AppShell>
		</>
	);
}
