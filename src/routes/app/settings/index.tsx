import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old links point at `/app/settings`; profile is the first tab. */
export const Route = createFileRoute("/app/settings/")({
	beforeLoad: () => {
		throw redirect({ to: "/app/settings/profile", replace: true });
	},
});
