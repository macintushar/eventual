import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
	PublicPage,
	publicSignedInActions,
	publicSignedOutActions,
} from "#/components/public-header";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { EmptyMedia } from "#/components/ui/empty";
import { Spinner } from "#/components/ui/spinner";
import { useAppMutation } from "#/lib/app-mutation";
import { authClient } from "#/lib/auth-client";
import { invitationQueryOptions, sessionQueryOptions } from "#/lib/queries";
import { clearSession } from "#/lib/session";
import { isApiNotFound } from "#/lib/web-api-client";

export const Route = createFileRoute("/invite/$invitationId")({
	head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
	loader: async ({ context, params }) => {
		try {
			await Promise.all([
				context.queryClient.ensureQueryData(
					invitationQueryOptions(params.invitationId),
				),
				context.queryClient.ensureQueryData(sessionQueryOptions),
			]);
		} catch (error) {
			if (isApiNotFound(error)) throw notFound();
			throw error;
		}
	},
	component: InvitePage,
});

function InvitePage() {
	const { invitationId } = Route.useParams();
	const { data: invitation, isFetching } = useSuspenseQuery(
		invitationQueryOptions(invitationId),
	);
	const session = useSuspenseQuery(sessionQueryOptions).data;
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const accept = useAppMutation();
	const [switching, setSwitching] = useState(false);
	const invitedEmail = invitation.invitation.email;
	const here = `/invite/${invitationId}`;
	// Accept requires the exact invited address, so say so up front instead of
	// letting the button fail with a toast.
	const wrongAccount =
		session !== null &&
		session.user.email.toLowerCase() !== invitedEmail.toLowerCase();
	const unverified = session !== null && !session.user.emailVerified;
	const switchAccount = async () => {
		setSwitching(true);
		try {
			const { error } = await authClient.signOut();
			if (error) throw new Error(error.message);
		} catch {
			toast.error("Couldn't sign out", {
				description: "Check your connection and try again.",
			});
			setSwitching(false);
			return;
		}
		clearSession(queryClient);
		window.location.assign(`/login?redirect=${encodeURIComponent(here)}`);
	};

	return (
		<PublicPage
			user={session?.user ?? null}
			actions={session ? publicSignedInActions : publicSignedOutActions}
			mainClassName="items-center justify-center py-12"
		>
			<div className="w-full max-w-lg">
				<Card className="island-shell rise-in">
					<CardHeader className="items-center text-center">
						<EmptyMedia
							variant="icon"
							className="mx-auto bg-primary/10 text-primary"
						>
							<Users />
						</EmptyMedia>
						<CardTitle className="display-title text-3xl">
							Join {invitation.groupName}
							{isFetching ? (
								<Spinner className="ml-2 inline size-4 text-muted-foreground" />
							) : null}
						</CardTitle>
						<CardDescription>
							<strong className="font-semibold text-foreground">
								{invitation.inviterName}
							</strong>{" "}
							invited {invitation.invitation.email} as{" "}
							{invitation.invitation.role}.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{session && wrongAccount ? (
							<>
								<Alert>
									<AlertTitle>This invitation is for another email</AlertTitle>
									<AlertDescription>
										<p>
											You're signed in as{" "}
											<strong className="text-foreground">
												{session.user.email}
											</strong>
											, but {invitation.inviterName} invited{" "}
											<strong className="text-foreground">
												{invitedEmail}
											</strong>
											. Sign in with that address to join, or ask{" "}
											{invitation.inviterName} to invite {session.user.email}{" "}
											instead.
										</p>
									</AlertDescription>
								</Alert>
								<Button
									size="lg"
									variant="outline"
									disabled={switching}
									onClick={switchAccount}
								>
									{switching ? <Spinner data-icon="inline-start" /> : null}
									Sign in as {invitedEmail}
								</Button>
							</>
						) : session && unverified ? (
							<Alert>
								<AlertTitle>Verify your email to join</AlertTitle>
								<AlertDescription>
									<p>
										Open the verification link we sent to {session.user.email},
										then come back to this page. You can send a new link from{" "}
										<Link to="/app/settings/profile" className="underline">
											your account page
										</Link>
										.
									</p>
								</AlertDescription>
							</Alert>
						) : session ? (
							<Button
								size="lg"
								disabled={accept.isPending}
								onClick={async () => {
									const outcome = await accept.execute({
										action: "invitation.accept",
										input: { invitationId },
									});
									if (
										!outcome.ok ||
										!outcome.result ||
										typeof outcome.result !== "object" ||
										!("groupId" in outcome.result) ||
										typeof outcome.result.groupId !== "string"
									)
										return;
									toast.success(`Welcome to ${invitation.groupName}`);
									await navigate({
										to: "/app/groups/$groupId",
										params: { groupId: outcome.result.groupId },
									});
								}}
							>
								{accept.isPending ? <Spinner data-icon="inline-start" /> : null}
								{accept.isPending ? "Joining…" : "Accept invitation"}
							</Button>
						) : (
							<>
								<p className="text-center text-sm text-muted-foreground">
									Sign in to accept — we'll bring you straight back here.
								</p>
								<div className="flex flex-col gap-2 sm:flex-row">
									<Button className="flex-1" asChild>
										<Link to="/signup" search={{ redirect: here }}>
											Create an account
										</Link>
									</Button>
									<Button variant="outline" className="flex-1" asChild>
										<Link to="/login" search={{ redirect: here }}>
											Log in
										</Link>
									</Button>
								</div>
							</>
						)}
					</CardContent>
				</Card>
			</div>
		</PublicPage>
	);
}
