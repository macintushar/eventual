import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
} from "@tanstack/react-router";

import { AppBreadcrumb } from "#/components/app-breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";

const TABS = [
	{ value: "profile", to: "/app/settings/profile", label: "Profile" },
	{ value: "api-keys", to: "/app/settings/api-keys", label: "API keys" },
] as const;

export const Route = createFileRoute("/app/settings")({
	component: SettingsLayout,
});

/**
 * Laid out like a group page, except each tab is its own URL so a link can
 * land on API keys directly. The triggers are links: the router owns which
 * tab is open, and `manual` activation stops arrow keys from navigating.
 */
function SettingsLayout() {
	const { user } = Route.useRouteContext();
	const pathname = useLocation({ select: (location) => location.pathname });
	const active =
		TABS.find((tab) => pathname.startsWith(tab.to))?.value ?? "profile";

	return (
		<div className="col-form flex flex-col gap-5 sm:gap-6">
			<AppBreadcrumb
				parent={{ label: "All groups", to: "/app" }}
				page="Settings"
			/>
			<header className="rise-in min-w-0">
				<p className="island-kicker">Account</p>
				<h1 className="display-title mt-2 text-[2.125rem] font-bold sm:text-5xl">
					{user.name}
				</h1>
				<p className="mt-1 truncate text-sm text-muted-foreground">
					{user.email}
				</p>
			</header>

			<Tabs value={active} activationMode="manual">
				<TabsList className="segmented rail h-auto w-full justify-start p-1 [&>*]:shrink-0">
					{TABS.map((tab) => (
						<TabsTrigger key={tab.value} value={tab.value} asChild>
							<Link to={tab.to}>{tab.label}</Link>
						</TabsTrigger>
					))}
				</TabsList>
				<TabsContent value={active} className="mt-5">
					<Outlet />
				</TabsContent>
			</Tabs>
		</div>
	);
}
