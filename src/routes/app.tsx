import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AnalyticsIdentity } from "#/components/analytics-provider";
import { AppShell } from "#/components/app-shell";
import { sessionQueryOptions } from "#/lib/queries";

export const Route = createFileRoute("/app")({
	head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.fetchQuery(sessionQueryOptions);
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
