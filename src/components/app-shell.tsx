import { Link, useRouter } from "@tanstack/react-router";
import { KeyRound, LogOut, Plug } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

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
import { authClient } from "#/lib/auth-client";
import { cn } from "#/lib/utils";

export function Wordmark({ to = "/" }: { to?: "/" | "/app" }) {
	return (
		<Link
			to={to}
			className="display-title text-xl font-bold text-foreground no-underline"
		>
			Even<span className="text-primary">tual</span>
		</Link>
	);
}

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

		const measure = () => {
			frame = 0;
			const y = window.scrollY;
			const scrolled = y > 4;
			const delta = y - last;
			// Ignore rubber-banding and sub-gesture jitter, otherwise the header
			// flickers whenever a finger rests on the screen.
			if (Math.abs(delta) < 8) {
				setState((old) =>
					old.scrolled === scrolled ? old : { ...old, scrolled },
				);
				return;
			}
			last = y;
			setState({ hidden: delta > 0 && y > 96, scrolled });
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

function AccountMenu({
	user,
	onSignOut,
}: {
	user: { name: string; email: string };
	onSignOut: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="press rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				aria-label="Account menu"
			>
				<MemberAvatar name={user.name} seed={user.email} className="size-9" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={8} className="w-56">
				<DropdownMenuLabel className="flex flex-col gap-0.5">
					<span className="font-medium">{user.name}</span>
					<span className="truncate text-xs font-normal text-muted-foreground">
						{user.email}
					</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/app/settings">
						<KeyRound />
						API keys
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link to="/docs">
						<Plug />
						Integrations
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={onSignOut}>
					<LogOut />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** Shared chrome for every signed-in page. */
export function AppShell({
	user,
	children,
}: {
	user: { name: string; email: string };
	children: ReactNode;
}) {
	const router = useRouter();
	const { hidden, scrolled } = useHeaderMotion();

	const signOut = async () => {
		await authClient.signOut();
		await router.navigate({ to: "/" });
	};

	return (
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
	);
}
