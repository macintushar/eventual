import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm } from "#/components/auth-form";
import { siteQueryOptions } from "#/lib/queries";
import { clearSession } from "#/lib/session";
export const Route = createFileRoute("/login")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
	// Landing here means the cached session is gone or was never valid, whether
	// the user signed out or a server function redirected them.
	beforeLoad: ({ context }) => {
		clearSession(context.queryClient);
	},
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(siteQueryOptions),
	component: () => <AuthForm mode="login" />,
});
