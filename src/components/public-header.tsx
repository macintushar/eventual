import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PublicDock } from "#/components/dock";
import { ThemeToggle } from "#/components/theme";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { Wordmark } from "#/components/wordmark";
import { cn } from "#/lib/utils";

export type PublicHeaderAction = {
	to: React.ComponentProps<typeof Link>["to"];
	label: string;
	shortLabel?: string;
	variant?: "default" | "ghost" | "outline";
	icon?: ReactNode;
	/** Extra ghost links hide on a phone so the dark pill still fits. */
	desktopOnly?: boolean;
	className?: string;
};

/** Quiet login plus the dark signup pill — the usual signed-out pair. */
export const publicSignedOutActions: PublicHeaderAction[] = [
	{ to: "/login", label: "Log in", desktopOnly: true },
	{ to: "/signup", label: "Start a group", variant: "default" },
];

/** Once a session is live the dark pill opens the app instead of signup. */
export const publicSignedInActions: PublicHeaderAction[] = [
	{ to: "/app", label: "Open app", variant: "default" },
];

/**
 * Section links then the session CTA — one header for every content page
 * (home, help, integrations, legal) so the site navigation never shifts.
 */
export function publicSiteActions(signedIn: boolean): PublicHeaderAction[] {
	return [
		{ to: "/help", label: "Help", desktopOnly: true },
		{ to: "/docs", label: "Integrations", desktopOnly: true },
		...(signedIn ? publicSignedInActions : publicSignedOutActions),
	];
}

/**
 * Shared masthead for every public page. Wordmark on the left, theme toggle
 * then the page's CTAs on the right — same height and spacing everywhere, so
 * only the labels and button variants change.
 */
export function PublicHeader({
	wordmarkTo = "/",
	actions,
}: {
	wordmarkTo?: "/" | "/app";
	actions: PublicHeaderAction[];
}) {
	return (
		<header className="page-wrap flex h-16 items-center justify-between gap-3 sm:h-20">
			<Wordmark to={wordmarkTo} />
			<div className="flex items-center gap-1 sm:gap-2">
				<ThemeToggle />
				{actions.map((action) => {
					const variant = action.variant ?? "ghost";
					return (
						<Button
							key={`${String(action.to)}:${action.label}`}
							variant={variant}
							className={cn(
								variant === "default" && "press",
								action.desktopOnly && "hidden sm:inline-flex",
								action.className,
							)}
							asChild
						>
							<Link to={action.to}>
								{action.icon}
								{action.shortLabel ? (
									<>
										<span className="sm:hidden">{action.shortLabel}</span>
										<span className="hidden sm:inline">{action.label}</span>
									</>
								) : (
									action.label
								)}
							</Link>
						</Button>
					);
				})}
			</div>
		</header>
	);
}

/**
 * The public chrome around a page: the shared header, a main column, an
 * optional footer, and the dock. Auth, invite and recovery screens use the
 * same shell as the landing page so the top of the product never jumps.
 */
/** Tagline on the left; page links, then Privacy and Terms, on the right. */
export function PublicFooter({
	tagline,
	children,
}: {
	tagline: string;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<span>{tagline}</span>
			<nav className="flex flex-wrap gap-4">
				{children}
				<Link to="/privacy">Privacy</Link>
				<Link to="/terms">Terms</Link>
			</nav>
		</div>
	);
}

export function PublicPage({
	user,
	actions,
	footer,
	mainClassName,
	children,
}: {
	user?: { name: string; email: string } | null;
	actions: PublicHeaderAction[];
	footer?: ReactNode;
	mainClassName?: string;
	children: ReactNode;
}) {
	return (
		<div className="pad-dock flex min-h-[100dvh] flex-col">
			<PublicHeader wordmarkTo={user ? "/app" : "/"} actions={actions} />
			<main className={cn("page-wrap flex flex-1 flex-col", mainClassName)}>
				{children}
			</main>
			{footer ? (
				<footer className="page-wrap py-8 text-xs text-muted-foreground">
					<Separator className="mb-8" />
					{footer}
				</footer>
			) : null}
			<PublicDock user={user ?? null} />
		</div>
	);
}
