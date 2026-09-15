import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
	PublicPage,
	publicSignedInActions,
	publicSignedOutActions,
} from "#/components/public-header";
import { useClientUser } from "#/lib/session";

export const Route = createFileRoute("/help")({
	head: () => ({ meta: [{ title: "Help center · Eventual" }] }),
	component: HelpLayout,
});

function HelpLayout() {
	const user = useClientUser();

	return (
		<PublicPage
			user={user}
			actions={user ? publicSignedInActions : publicSignedOutActions}
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
