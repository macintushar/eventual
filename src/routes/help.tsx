import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
	PublicPage,
	publicSignedInActions,
	publicSignedOutActions,
} from "#/components/public-header";
import { getSessionFn } from "#/server/fn/auth";

export const Route = createFileRoute("/help")({
	loader: async () => ({ session: await getSessionFn() }),
	head: () => ({ meta: [{ title: "Help center · Eventual" }] }),
	component: HelpLayout,
});

function HelpLayout() {
	const { session } = Route.useLoaderData();

	return (
		<PublicPage
			user={session?.user ?? null}
			actions={session ? publicSignedInActions : publicSignedOutActions}
			footer={
				<div className="flex flex-wrap items-center justify-between gap-3">
					<span>Eventual · expenses without the spreadsheet.</span>
					<Link to="/docs">Integrations</Link>
				</div>
			}
			mainClassName="py-8 sm:py-10"
		>
			<Outlet />
		</PublicPage>
	);
}
