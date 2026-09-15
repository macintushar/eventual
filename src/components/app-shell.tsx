import { Link, useRouter } from "@tanstack/react-router";
import { CircleHelp, KeyRound, LogOut, Plug } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { toast } from "sonner";

import { ComposerProvider } from "#/components/composer";
import { AppDock } from "#/components/dock";
import { MemberAvatar } from "#/components/member-avatar";
import { ThemeToggle } from "#/components/theme";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Separator } from "#/components/ui/separator";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "#/components/ui/sheet";
import { Wordmark } from "#/components/wordmark";
import { authClient } from "#/lib/auth-client";
import { clearSession } from "#/lib/session";
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

function AccountAvatar({ user }: { user: { name: string; email: string } }) {
	return <MemberAvatar name={user.name} seed={user.email} className="size-9" />;
}

const ACCOUNT_LINKS = [
	{ to: "/help", icon: CircleHelp, label: "Help center" },
	{ to: "/app/settings", icon: KeyRound, label: "API keys" },
	{ to: "/docs", icon: Plug, label: "Integrations" },
] as const;

/**
 * The account menu, in the shape each pointer wants. A cursor gets a dropdown
 * pinned to the avatar; a thumb gets a sheet, because the avatar lives in the
 * top-right corner — the hardest place on a phone to reach, and the worst
 * place to then have to hit a 32px row.
 *
 * Both are rendered and one is hidden per breakpoint rather than measured in
 * JS, so the server and the client always agree on the markup.
 */
function AccountMenu({
	user,
	onSignOut,
}: {
	user: { name: string; email: string };
	onSignOut: () => void;
}) {
	return (
		<>
			<Sheet>
				<SheetTrigger
					className="press rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:hidden"
					aria-label="Account menu"
				>
					<AccountAvatar user={user} />
				</SheetTrigger>
				<SheetContent side="bottom" className="gap-5">
					<SheetHeader className="flex-row items-center gap-3">
						<AccountAvatar user={user} />
						<span className="flex min-w-0 flex-col">
							<SheetTitle>{user.name}</SheetTitle>
							<SheetDescription className="truncate text-xs">
								{user.email}
							</SheetDescription>
						</span>
					</SheetHeader>

					<div className="flex flex-col">
						{ACCOUNT_LINKS.map(({ to, icon: Icon, label }) => (
							<SheetClose key={to} asChild>
								<Link to={to} className="sheet-row">
									<Icon className="size-[1.125rem] text-muted-foreground" />
									{label}
								</Link>
							</SheetClose>
						))}

						<Separator className="my-1.5" />

						<SheetClose asChild>
							<button
								type="button"
								className="sheet-row"
								data-variant="destructive"
								onClick={onSignOut}
							>
								<LogOut className="size-[1.125rem]" />
								Sign out
							</button>
						</SheetClose>
					</div>
				</SheetContent>
			</Sheet>

			<DropdownMenu>
				<DropdownMenuTrigger
					className="press hidden rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:block"
					aria-label="Account menu"
				>
					<AccountAvatar user={user} />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" sideOffset={8} className="w-56">
					<DropdownMenuLabel className="flex flex-col gap-0.5">
						<span className="font-medium">{user.name}</span>
						<span className="truncate text-xs font-normal text-muted-foreground">
							{user.email}
						</span>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{ACCOUNT_LINKS.map(({ to, icon: Icon, label }) => (
						<DropdownMenuItem key={to} asChild>
							<Link to={to}>
								<Icon />
								{label}
							</Link>
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={onSignOut}>
						<LogOut />
						Sign out
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
}

const InAppShell = createContext(false);

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
	const router = useRouter();
	const { hidden, scrolled } = useHeaderMotion();

	const signOut = async () => {
		// Better Auth reports failures on the result rather than by throwing, and
		// a dropped connection rejects, so both have to be caught: bailing out
		// silently would leave the menu closed and the session still live.
		try {
			const { error } = await authClient.signOut();
			if (error) throw new Error(error.message);
		} catch {
			toast.error("Couldn't sign out", {
				description: "Check your connection and try again.",
			});
			return;
		}
		clearSession();
		await router.navigate({ to: "/" });
	};

	return (
		<InAppShell.Provider value={true}>
			<ComposerProvider currentUserId={user.id}>
				<div className="pad-dock flex min-h-[100dvh] flex-col">
					<header
						className={cn(
							"sticky top-0 z-40 bg-background transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
							"border-b pt-[var(--safe-top)]",
							scrolled ? "border-border/80 shadow-sm" : "border-transparent",
							// Only phones reclaim the space; on a desktop the header never moves.
							hidden && "max-sm:-translate-y-[calc(100%+1px)]",
						)}
					>
						<div className="page-wrap flex h-[var(--header-h)] items-center justify-between gap-4 sm:h-16">
							<Wordmark to="/app" />

							{/*
							 * The masthead carries identity and the theme, nothing else. Who
							 * you are, API keys and Integrations all live behind the avatar at
							 * every width, so the header reads the same on a phone and on a
							 * desktop instead of growing a row of links at `sm`.
							 */}
							<div className="flex items-center gap-1">
								<ThemeToggle />
								<AccountMenu user={user} onSignOut={signOut} />
							</div>
						</div>
					</header>

					<main className="page-wrap flex-1 py-6 sm:py-8">{children}</main>

					<footer className="page-wrap hidden py-8 text-xs text-muted-foreground sm:block">
						Eventual · exact integer splits, in rupees.
					</footer>

					<AppDock user={user} />
				</div>
			</ComposerProvider>
		</InAppShell.Provider>
	);
}
