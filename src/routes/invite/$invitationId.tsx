import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
	PublicPage,
	publicSignedInActions,
	publicSignedOutActions,
} from "#/components/public-header";
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
import { getInvitationFn, mutateFn } from "#/server/fn/app";
import { getSessionFn } from "#/server/fn/auth";

export const Route = createFileRoute("/invite/$invitationId")({
	head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
	loader: async ({ params }) => ({
		invitation: await getInvitationFn({ data: params }),
		session: await getSessionFn(),
	}),
	component: InvitePage,
});

function InvitePage() {
	const { invitation, session } = Route.useLoaderData();
	const { invitationId } = Route.useParams();
	const navigate = useNavigate();
	const [joining, setJoining] = useState(false);

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
						{session ? (
							<Button
								size="lg"
								disabled={joining}
								onClick={async () => {
									setJoining(true);
									try {
										const result = await mutateFn({
											data: {
												action: "invitation.accept",
												input: { invitationId },
											},
										});
										toast.success(`Welcome to ${invitation.groupName}`);
										if (result && "groupId" in result)
											await navigate({
												to: "/app/groups/$groupId",
												params: { groupId: result.groupId },
											});
									} catch (error) {
										toast.error(
											error instanceof Error ? error.message : "Could not join",
										);
									} finally {
										setJoining(false);
									}
								}}
							>
								{joining ? <Spinner data-icon="inline-start" /> : null}
								{joining ? "Joining…" : "Accept invitation"}
							</Button>
						) : (
							<>
								<p className="text-center text-sm text-muted-foreground">
									Sign in to accept — we'll bring you straight back here.
								</p>
								<div className="flex flex-col gap-2 sm:flex-row">
									<Button className="flex-1" asChild>
										<Link
											to="/signup"
											search={{ redirect: `/invite/${invitationId}` }}
										>
											Create an account
										</Link>
									</Button>
									<Button variant="outline" className="flex-1" asChild>
										<Link
											to="/login"
											search={{ redirect: `/invite/${invitationId}` }}
										>
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
