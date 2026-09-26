import { useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { Users } from "lucide-react";
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
import { useAppMutation } from "#/lib/app-mutation";
import { invitationQueryOptions, sessionQueryOptions } from "#/lib/queries";
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
	const accept = useAppMutation();

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
						{session ? (
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
