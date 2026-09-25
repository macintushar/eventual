import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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
import {
	getPendingVerificationFn,
	sendPendingVerificationFn,
} from "#/server/fn/pending-verification";

export const Route = createFileRoute("/check-email")({
	loader: async () => {
		const pending = await getPendingVerificationFn();
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
	const { email } = Route.useLoaderData();
	const [pending, setPending] = useState(true);
	const [error, setError] = useState("");
	const [retryAt, setRetryAt] = useState("");
	const [now, setNow] = useState(Date.now());
	const remainingSeconds = Math.max(
		0,
		Math.ceil((new Date(retryAt).getTime() - now) / 1000) || 0,
	);

	const send = useCallback(async () => {
		setPending(true);
		setError("");
		try {
			const result = await sendPendingVerificationFn();
			setRetryAt(result.retryAt);
		} catch (cause) {
			setRetryAt("");
			setError(
				cause instanceof Error ? cause.message : "Could not send the email.",
			);
		} finally {
			setPending(false);
		}
	}, []);

	useEffect(() => {
		void send();
	}, [send]);

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
					{error ? (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					) : retryAt ? (
						<output className="text-sm">
							A verification email was sent recently.
						</output>
					) : null}
					<Button
						type="button"
						variant="outline"
						disabled={pending || remainingSeconds > 0}
						onClick={() => void send()}
					>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						{pending
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
