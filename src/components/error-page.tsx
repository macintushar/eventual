import * as Sentry from "@sentry/tanstackstart-react";
import {
	type ErrorComponentProps,
	Link,
	useRouter,
} from "@tanstack/react-router";
import {
	ArrowLeft,
	Compass,
	House,
	type LucideIcon,
	RotateCw,
	TriangleAlert,
	Wallet,
} from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { toast } from "sonner";

import { useInAppShell, Wordmark } from "#/components/app-shell";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { EmptyMedia } from "#/components/ui/empty";

/**
 * Shared shape for both dead ends: a kicker, one short display-size line, quiet
 * supporting copy, a dark pill, and a single handwritten note. The panel stays
 * neutral paper — an error is not a balance, so it doesn't borrow the status
 * colours, and the words carry the meaning instead (DESIGN.md → Status colours).
 *
 * A boundary renders this on every route, so it appears in two places. Inside
 * the signed-in shell there is already a masthead, and it is just the panel.
 * Anywhere else — the landing page, auth, invites, docs — nothing surrounds it,
 * so it takes the viewport and reintroduces the wordmark the way the other
 * standalone screens do.
 */
function ErrorLayout({
	icon: Icon,
	kicker,
	title,
	description,
	note,
	actions,
	detail,
}: {
	icon: LucideIcon;
	kicker: string;
	title: string;
	description: string;
	note: string;
	actions: ReactNode;
	detail?: string;
}) {
	const inShell = useInAppShell();

	const panel = (
		<div className="mx-auto w-full max-w-xl">
			{inShell ? null : (
				<div className="mb-6 flex justify-center">
					<Wordmark />
				</div>
			)}

			<Card className="island-shell rise-in rounded-3xl">
				<CardContent className="flex flex-col items-center gap-5 text-center sm:px-10">
					<EmptyMedia variant="icon" className="mb-0">
						<Icon />
					</EmptyMedia>

					<div>
						<p className="island-kicker">{kicker}</p>
						<h1 className="display-title mt-3 text-[2rem] text-balance sm:text-4xl">
							{title}
						</h1>
						{/* Centred copy needs a short measure to stay readable. */}
						<p className="mx-auto mt-3 max-w-md text-sm text-balance text-muted-foreground sm:text-base">
							{description}
						</p>
					</div>

					<div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
						{actions}
					</div>

					{/*
					 * Developers need the message; users get the logged report instead.
					 * `import.meta.env.DEV` is replaced at build time, so this drops out
					 * of production bundles rather than merely being hidden in them.
					 */}
					{detail && import.meta.env.DEV ? (
						<details className="w-full text-left">
							<summary className="cursor-pointer text-sm text-muted-foreground">
								Technical detail (development only)
							</summary>
							<pre className="mt-2 overflow-x-auto rounded-lg border bg-muted p-3 text-xs">
								{detail}
							</pre>
						</details>
					) : null}
				</CardContent>
			</Card>

			{/* The one handwritten mark per screen. */}
			<div className="mt-6 flex justify-center">
				<p className="sticky-note">{note}</p>
			</div>
		</div>
	);

	if (inShell) return panel;

	return (
		<main className="page-wrap grid min-h-[100dvh] place-items-center py-12">
			{panel}
		</main>
	);
}

/**
 * Replaces TanStack's default error component, which renders an unstyled red
 * stack trace in the corner of the page. Reporting lives here so that every
 * boundary showing this screen files the error, not just the root one.
 */
export function ErrorScreen({ error, reset }: ErrorComponentProps) {
	const router = useRouter();
	const inShell = useInAppShell();

	useEffect(() => {
		Sentry.captureException(error, { tags: { boundary: "route" } });
	}, [error]);

	return (
		<ErrorLayout
			icon={TriangleAlert}
			kicker="Something went wrong"
			title="This page didn't load."
			description="The error has been logged. Nothing you had saved was changed."
			note="Your balances are safe."
			detail={error instanceof Error ? error.message : String(error)}
			actions={
				<>
					<Button
						className="press"
						onClick={() => {
							reset();
							// A loader that throws again is caught by this boundary and
							// redraws the screen. Only the refetch itself failing outright
							// would otherwise leave the retry with nothing to show.
							void router.invalidate().catch(() => {
								toast.error("Couldn't reload", {
									description: "Check your connection and try again.",
								});
							});
						}}
					>
						<RotateCw data-icon="inline-start" />
						Try again
					</Button>
					<Button variant="outline" asChild>
						<Link to={inShell ? "/app" : "/"}>
							{inShell ? "Your groups" : "Back to home"}
						</Link>
					</Button>
				</>
			}
		/>
	);
}

/**
 * Replaces TanStack's `<p>Not Found</p>`. Reached by stale invite links and by
 * groups or expenses deleted while a tab sat open, so going back to the page
 * before is usually the move that works.
 */
export function NotFoundScreen() {
	const router = useRouter();
	const inShell = useInAppShell();

	return (
		<ErrorLayout
			icon={Compass}
			kicker="Page not found"
			title="We can't find that page."
			description="The link may be out of date, or whatever it pointed to has since been deleted."
			note="Check the link and try again."
			actions={
				<>
					<Button className="press" asChild>
						{/* Same icons the dock uses for these two destinations. */}
						<Link to={inShell ? "/app" : "/"}>
							{inShell ? (
								<Wallet data-icon="inline-start" />
							) : (
								<House data-icon="inline-start" />
							)}
							{inShell ? "Your groups" : "Back to home"}
						</Link>
					</Button>
					<Button variant="outline" onClick={() => router.history.back()}>
						<ArrowLeft data-icon="inline-start" />
						Go back
					</Button>
				</>
			}
		/>
	);
}
