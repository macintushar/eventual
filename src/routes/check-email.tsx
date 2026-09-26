import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicPage } from "#/components/public-header";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Spinner } from "#/components/ui/spinner";
import { pendingVerificationQueryOptions } from "#/lib/queries";
import { sendPendingVerificationFn } from "#/lib/web-api-client";

export const Route = createFileRoute("/check-email")({
	loader: async ({ context }) => {
		const pending = await context.queryClient.ensureQueryData(
			pendingVerificationQueryOptions,
		);
		if (!pending) throw redirect({ to: "/login" });
		return pending;
	},
	head: () => ({
		meta: [
			{ title: "Check your email · Eventual" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: CheckEmailPage,
});

function CheckEmailPage() {
	const { email } = useSuspenseQuery(pendingVerificationQueryOptions).data ?? {
		email: "",
	};
	const [retryAt, setRetryAt] = useState("");
	const [now, setNow] = useState(Date.now());
	const remainingSeconds = Math.max(
		0,
		Math.ceil((new Date(retryAt).getTime() - now) / 1000) || 0,
	);
	const send = useMutation({
		mutationFn: sendPendingVerificationFn,
		onSuccess: (result) => setRetryAt(result.retryAt),
	});

	useEffect(() => {
		send.mutate();
	}, [send.mutate]);

	useEffect(() => {
		if (!retryAt) return;
		const interval = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(interval);
	}, [retryAt]);

	return (
		<PublicPage
			actions={[{ to: "/login", label: "Log in", variant: "default" }]}
			mainClassName="items-center justify-center py-12"
		>
			<Card className="w-full max-w-md island-shell rise-in">
				<CardHeader>
					<CardTitle className="display-title text-2xl">
						Check your email
					</CardTitle>
					<CardDescription>
						Verify <span className="font-medium text-foreground">{email}</span>{" "}
						to sign in.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<p className="text-sm text-muted-foreground">
						Open the verification link in your inbox. It expires after one hour.
						Check your spam folder if you don't see it.
					</p>
					{send.isError ? (
						<Alert variant="destructive">
							<AlertDescription>
								{send.error instanceof Error
									? send.error.message
									: "Could not send the email."}
							</AlertDescription>
						</Alert>
					) : retryAt ? (
						<output className="text-sm">
							A verification email was sent recently.
						</output>
					) : null}
					<Button
						type="button"
						variant="outline"
						disabled={send.isPending || remainingSeconds > 0}
						onClick={() => send.mutate()}
					>
						{send.isPending ? <Spinner data-icon="inline-start" /> : null}
						{send.isPending
							? "Sending…"
							: remainingSeconds > 0
								? `Resend in ${Math.ceil(remainingSeconds / 60)} min`
								: "Resend verification email"}
					</Button>
					<Link to="/login" className="self-center text-sm underline">
						Back to log in
					</Link>
				</CardContent>
			</Card>
		</PublicPage>
	);
}
