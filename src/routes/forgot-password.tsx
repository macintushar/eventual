import { createFileRoute } from "@tanstack/react-router";
import { PasswordRecovery } from "#/components/password-recovery";

export const Route = createFileRoute("/forgot-password")({
	head: () => ({ meta: [{ title: "Reset password · Eventual" }] }),
	component: () => <PasswordRecovery mode="request" />,
});
