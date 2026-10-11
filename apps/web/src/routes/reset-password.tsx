import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PasswordRecovery } from "#/components/password-recovery";

export const Route = createFileRoute("/reset-password")({
	validateSearch: z.object({
		token: z.string().optional(),
		error: z.string().optional(),
	}),
	head: () => ({
		meta: [
			{ title: "Choose a password · Eventual" },
			{ name: "referrer", content: "no-referrer" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: ResetPassword,
});

function ResetPassword() {
	const { token, error } = Route.useSearch();
	return (
		<PasswordRecovery mode="reset" token={token} invalid={Boolean(error)} />
	);
}
