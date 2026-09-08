import { createFileRoute } from "@tanstack/react-router";
import { ApiKeys } from "#/components/api-keys";
import { AppBreadcrumb } from "#/components/app-breadcrumb";
import { listApiKeysFn } from "#/server/fn/api-keys";

export const Route = createFileRoute("/app/settings")({
	loader: () => listApiKeysFn(),
	component: SettingsPage,
});

function SettingsPage() {
	const keys = Route.useLoaderData();
	const { user } = Route.useRouteContext();

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
			<AppBreadcrumb
				parent={{ label: "All groups", to: "/app" }}
				page="API keys"
			/>
			<div>
				<p className="island-kicker">Account</p>
				<h1 className="display-title mt-2 text-3xl font-bold">{user.name}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
			</div>
			<ApiKeys initialKeys={keys} />
		</div>
	);
}
