import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm } from "#/components/auth-form";
import { clearSession } from "#/lib/session";
export const Route = createFileRoute("/login")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
	// Landing here means the cached session is gone or was never valid, whether
	// the user signed out or a server function redirected them.
	beforeLoad: ({ context }) => {
		clearSession(context.queryClient);
	},
	component: () => <AuthForm mode="login" />,
});
