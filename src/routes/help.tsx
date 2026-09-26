import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
	PublicFooter,
	PublicPage,
	publicSiteActions,
} from "#/components/public-header";
import { useClientUser } from "#/lib/session";

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
		// No canonical here: HeadContent doesn't dedupe links, so a layout
		// canonical would ship alongside every article's own.
	}),
	component: HelpLayout,
});

function HelpLayout() {
	const user = useClientUser();

	return (
		<PublicPage
			user={user}
			actions={publicSiteActions(Boolean(user))}
			footer={
				<PublicFooter tagline="Eventual · expenses without the spreadsheet.">
					<Link to="/docs">Integrations</Link>
				</PublicFooter>
			}
			mainClassName="py-8 sm:py-10"
		>
			<Outlet />
		</PublicPage>
	);
}
