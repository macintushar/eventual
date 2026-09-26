import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
	PublicPage,
	publicSignedInActions,
	publicSignedOutActions,
} from "#/components/public-header";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { sessionQueryOptions } from "#/lib/queries";

export const Route = createFileRoute("/verify-email")({
	validateSearch: z.object({ error: z.string().optional() }),
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(sessionQueryOptions),
	head: () => ({
		meta: [
			{ title: "Email verification · Eventual" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: VerificationResult,
});

function VerificationResult() {
	const { error } = Route.useSearch();
	const session = useSuspenseQuery(sessionQueryOptions).data;
	return (
		<PublicPage
			user={session?.user ?? null}
			actions={session ? publicSignedInActions : publicSignedOutActions}
			mainClassName="items-center justify-center py-12"
		>
			<Card className="w-full max-w-md island-shell">
				<CardHeader>
					<CardTitle>
						{error
							? "This verification link didn't work"
							: "Email verification complete"}
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<p>
						{error
							? "The link may have expired. Sign in and request another verification email from your account page."
							: "You can return to Eventual and check your email status on your account page."}
					</p>
					<Link to="/app/settings/profile" className="underline">
						Continue to your account
					</Link>
				</CardContent>
			</Card>
		</PublicPage>
	);
}
