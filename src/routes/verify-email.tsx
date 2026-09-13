import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PublicPage, publicSignedInActions } from "#/components/public-header";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

export const Route = createFileRoute("/verify-email")({
	validateSearch: z.object({ error: z.string().optional() }),
	head: () => ({ meta: [{ title: "Email verification · Eventual" }] }),
	component: VerificationResult,
});

function VerificationResult() {
	const { error } = Route.useSearch();
	return (
		<PublicPage
			actions={publicSignedInActions}
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
					<Link to="/app/settings" className="underline">
						Continue to your account
					</Link>
				</CardContent>
			</Card>
		</PublicPage>
	);
}
