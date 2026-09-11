import { Link, useRouter } from "@tanstack/react-router";
import { KeyRound, LogOut, Plug } from "lucide-react";
import type { ReactNode } from "react";

import { MemberAvatar } from "#/components/member-avatar";
import { ThemeToggle } from "#/components/theme";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";

export function Wordmark({ to = "/" }: { to?: "/" | "/app" }) {
	return (
		<Link
			to={to}
			className="display-title text-xl font-bold text-foreground no-underline"
		>
			Even<span className="text-primary">Tual</span>
		</Link>
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
	return (
		<div className="flex min-h-screen flex-col">
			<header className="sticky top-0 z-40 border-b border-border/80 bg-background/70 backdrop-blur-md">
				<div className="page-wrap flex h-16 items-center justify-between gap-4">
					<Wordmark to="/app" />
					<div className="flex items-center gap-1">
						<ThemeToggle />
						<Button variant="ghost" size="sm" asChild>
							<Link to="/docs">
								<Plug data-icon="inline-start" />
								<span className="hidden sm:inline">Integrations</span>
							</Link>
						</Button>
						<Button variant="ghost" size="sm" asChild>
							<Link to="/app/settings">
								<KeyRound data-icon="inline-start" />
								<span className="hidden sm:inline">API keys</span>
							</Link>
						</Button>
						<span className="mx-2 hidden text-sm text-muted-foreground sm:inline">
							{user.name}
						</span>
						<MemberAvatar
							name={user.name}
							seed={user.email}
							className="size-8"
						/>
						<Button
							variant="ghost"
							size="sm"
							className="ml-1"
							onClick={async () => {
								await authClient.signOut();
								await router.navigate({ to: "/" });
							}}
						>
							<LogOut data-icon="inline-start" />
							<span className="hidden sm:inline">Sign out</span>
						</Button>
					</div>
				</div>
			</header>
			<main className="page-wrap flex-1 py-8">{children}</main>
			<footer className="page-wrap py-8 text-xs text-muted-foreground">
				EvenTual · exact integer splits, in rupees.
			</footer>
		</div>
	);
}
