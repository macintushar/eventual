import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
	PublicPage,
	publicSignedInActions,
	publicSignedOutActions,
} from "#/components/public-header";
import { useClientUser } from "#/lib/session";
import { SITE_URL } from "#/lib/site";

export const Route = createFileRoute("/help")({
	head: () => ({
		meta: [
			{ title: "Help center · Eventual" },
			{
				name: "description",
				content:
					"How to start a group, split a bill, and settle up in Eventual — plus answers on invites, locked expenses and repayments.",
			},
		],
		links: [
			{
				rel: "canonical",
				href: `${SITE_URL}/help`,
			},
		],
	}),
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
