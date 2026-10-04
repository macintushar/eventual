import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import {
	PublicPage,
	publicSignedInActions,
	publicSignedOutActions,
} from "#/components/public-header";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { safeAuthRedirect } from "#/lib/auth-redirect";
import { sessionQueryOptions } from "#/lib/queries";

export const Route = createFileRoute("/verify-email")({
	validateSearch: z.object({
		error: z.string().optional(),
		next: z.string().optional(),
	}),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const session =
			await context.queryClient.ensureQueryData(sessionQueryOptions);
		// Verification signs the user in, so a signup that started on an invite
		// goes straight back to it instead of stopping here.
		if (!deps.error && session && deps.next)
			throw redirect({ href: safeAuthRedirect(deps.next) });
		return session;
	},
	head: () => ({
		meta: [
			{ title: "Email verification · Eventual" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: VerificationResult,
});

function VerificationResult() {
	const { error, next } = Route.useSearch();
	const session = useSuspenseQuery(sessionQueryOptions).data;
	const target = safeAuthRedirect(next);
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
							? session
								? "The link may have expired. You can request a new one from your account page."
								: "The link may have expired. Sign in and we'll send you a new one."
							: session
								? "You're all set. Any groups you've been invited to are waiting for you."
								: "Sign in to continue to Eventual."}
					</p>
					{session ? (
						error ? (
							<Link to="/app/settings/profile" className="underline">
								Go to your account
							</Link>
						) : (
							// `target` is a sanitized path that may carry its own query.
							<a href={target} className="underline">
								Continue to Eventual
							</a>
						)
					) : (
						<Link
							to="/login"
							search={target === "/app" ? {} : { redirect: target }}
							className="underline"
						>
							Sign in
						</Link>
					)}
				</CardContent>
			</Card>
		</PublicPage>
	);
}
