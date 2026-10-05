import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

import {
	CommandPaletteProvider,
	CommandPaletteTrigger,
} from "#/components/command-palette";
import { ComposerProvider } from "#/components/composer";
import { AppDock } from "#/components/dock";
import { PendingInvitationsBanner } from "#/components/pending-invitations-banner";
import { StatusPageCallout, useStatusPageUrl } from "#/components/status-page";
import { ThemeToggle } from "#/components/theme";
import { Wordmark } from "#/components/wordmark";
import { cn } from "#/lib/utils";

/**
 * Tracks the page scroll so the masthead can get out of the way. On a phone the
 * header is a sixth of the usable height, so it slides off on a downward swipe
 * and comes straight back on an upward one — the list stays the whole screen
 * while you read it, and navigation is one flick away.
 */
function useHeaderMotion() {
	const [state, setState] = useState({ hidden: false, scrolled: false });

	useEffect(() => {
		let last = window.scrollY;
		let frame = 0;

		const updateState = (
			next: (old: { hidden: boolean; scrolled: boolean }) => {
				hidden: boolean;
				scrolled: boolean;
			},
		) => {
			setState((old) => {
				const updated = next(old);
				return old.hidden === updated.hidden &&
					old.scrolled === updated.scrolled
					? old
					: updated;
			});
		};

		const measure = () => {
			frame = 0;
			const y = window.scrollY;
			const scrolled = y > 4;
			const delta = y - last;
			// Ignore rubber-banding and sub-gesture jitter, otherwise the header
			// flickers whenever a finger rests on the screen.
			if (Math.abs(delta) < 8) {
				updateState((old) => ({ ...old, scrolled }));
				return;
			}
			last = y;
			updateState(() => ({ hidden: delta > 0 && y > 96, scrolled }));
		};

		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			window.removeEventListener("scroll", onScroll);
			if (frame) cancelAnimationFrame(frame);
		};
	}, []);

	return state;
}

const InAppShell = createContext(false);

/**
 * The signed-in tagline stays desktop-only, matching the dock on a phone.
 * A published status page is the exception: that callout has to stay reachable
 * without scrolling past a desktop-only footer.
 */
function AppFooter() {
	const statusPageUrl = useStatusPageUrl();

	return (
		<footer
			className={cn(
				"page-wrap py-8 text-xs text-muted-foreground",
				statusPageUrl ? undefined : "hidden sm:block",
			)}
		>
			<div
				className={cn(
					"flex flex-wrap items-center gap-3",
					statusPageUrl && "justify-end sm:justify-between",
				)}
			>
				<span className={statusPageUrl ? "hidden sm:inline" : undefined}>
					Eventual · Exact splits, down to the smallest unit.
				</span>
				<StatusPageCallout />
			</div>
		</footer>
	);
}

/**
 * Whether a masthead is already on the page. Error and not-found screens are
 * rendered by a boundary on every route, inside this shell for signed-in pages
 * and bare in the document everywhere else, so they read this to decide between
 * taking over the viewport and sitting in the page as a panel.
 */
export function useInAppShell() {
	return useContext(InAppShell);
}

/** Shared chrome for every signed-in page. */
export function AppShell({
	user,
	children,
}: {
	user: { id: string; name: string; email: string };
	children: ReactNode;
}) {
	const { hidden, scrolled } = useHeaderMotion();

	return (
		<InAppShell.Provider value={true}>
			<ComposerProvider currentUserId={user.id}>
				<CommandPaletteProvider>
					<div className="pad-dock flex min-h-[100dvh] flex-col">
						<header
							className={cn(
								"sticky top-0 z-40 bg-background transition-[translate,box-shadow,border-color] duration-300 ease-(--ease-out-soft) motion-reduce:transition-none",
								"border-b pt-[var(--safe-top)]",
								scrolled ? "border-border/80 shadow-sm" : "border-transparent",
								// Only phones reclaim the space; on a desktop the header never moves.
								hidden && "max-sm:-translate-y-[calc(100%+1px)]",
							)}
						>
							<div className="page-wrap flex h-[var(--header-h)] items-center justify-between gap-4 sm:h-16">
								<Wordmark to="/app" />

								{/* Wordmark, search and theme, nothing else: the account lives
							    in the dock, where a thumb already is and which never scrolls
							    away. */}
								<div className="flex items-center gap-1 sm:gap-2">
									<CommandPaletteTrigger />
									<ThemeToggle />
								</div>
							</div>
						</header>

						<main className="page-wrap flex-1 py-6 sm:py-8">
							<PendingInvitationsBanner />
							{children}
						</main>

						<AppFooter />

						<AppDock user={user} />
					</div>
				</CommandPaletteProvider>
			</ComposerProvider>
		</InAppShell.Provider>
	);
}
