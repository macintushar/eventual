import {
	Link,
	useLocation,
	useParams,
	useRouter,
} from "@tanstack/react-router";
import {
	ArrowLeft,
	Blocks,
	CircleHelp,
	House,
	LogIn,
	Plus,
	Receipt,
	UserRound,
	UsersRound,
	Wallet,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { useComposer } from "#/components/composer";
import { MemberAvatar } from "#/components/member-avatar";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { loadSession } from "#/lib/session";
import { cn } from "#/lib/utils";

const ICON = "size-[1.375rem]";

function DockItem({
	active,
	label,
	children,
	...link
}: {
	active?: boolean;
	/** Icon-only, so this is the control's entire accessible name. */
	label: string;
	children: ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "children">) {
	return (
		<Link
			{...link}
			className="dock-item"
			data-active={active}
			aria-label={label}
			title={label}
			aria-current={active ? "page" : undefined}
		>
			{children}
		</Link>
	);
}

/** Shared innards of a compose row: a circled icon, a label, a line of context. */
function ComposeBody({
	icon,
	title,
	hint,
}: {
	icon: ReactNode;
	title: string;
	hint: string;
}) {
	return (
		<>
			<span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
				{icon}
			</span>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="font-medium">{title}</span>
				<span className="text-xs text-muted-foreground">{hint}</span>
			</span>
		</>
	);
}

const COMPOSE_ITEM = "gap-3 rounded-xl p-2.5 [&_svg]:text-foreground";

function profileActive(pathname: string, signedIn: boolean) {
	if (pathname.startsWith("/help")) return true;
	if (signedIn) return pathname.startsWith("/app/settings");
	return pathname === "/login" || pathname === "/signup";
}

/**
 * The compose menu behind the dock's centre button. Both ways of starting
 * something live here rather than the button guessing from the route — an
 * action you can see is an action you can find again.
 *
 * Neither one navigates: they open a stepped dialog over whatever you were
 * looking at, so a half-finished expense never costs you your place.
 */
function ComposeButton({
	groupId,
	open,
	onOpenChange,
}: {
	groupId?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const composer = useComposer();

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<Button
					size="icon"
					className="press mx-0.5 size-11 shrink-0 rounded-full"
					aria-label="New expense or group"
				>
					{/* The plus turns into a close mark, so the button reads as the
					    same object in both states rather than swapping icons. */}
					<Plus
						className={cn(
							ICON,
							"transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
							open && "rotate-45",
						)}
					/>
				</Button>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				side="top"
				align="center"
				sideOffset={14}
				className="dock-menu"
			>
				{/* The composer carries its own group step now, so this is offered
				    everywhere — inside a group it just arrives preselected. */}
				<DropdownMenuItem
					className={COMPOSE_ITEM}
					onSelect={() => composer.expense({ groupId })}
				>
					<ComposeBody
						icon={<Receipt className="size-[1.125rem]" />}
						title="New expense"
						hint={
							groupId
								? "Split a cost with this group"
								: "Pick a group and split"
						}
					/>
				</DropdownMenuItem>

				<DropdownMenuItem
					className={COMPOSE_ITEM}
					onSelect={() => composer.group()}
				>
					<ComposeBody
						icon={<UsersRound className="size-[1.125rem]" />}
						title="New group"
						hint="Start a shared tab with people"
					/>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * The dock's last slot. Help used to live in every footer; it belongs with
 * who you are, because that is the same place you already reach for settings
 * or sign-in.
 */
function ProfileButton({
	user,
	open,
	onOpenChange,
	active,
}: {
	user?: { name: string; email: string } | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	active?: boolean;
}) {
	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="dock-item"
					data-active={active || open}
					aria-label="Account menu"
					title="Account menu"
					aria-current={active ? "page" : undefined}
				>
					{user ? (
						<MemberAvatar
							name={user.name}
							seed={user.email}
							className="size-[1.625rem] text-[9px]"
						/>
					) : (
						<UserRound className={ICON} aria-hidden="true" />
					)}
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				side="top"
				align="end"
				sideOffset={14}
				className="dock-menu"
			>
				<DropdownMenuItem asChild className={COMPOSE_ITEM}>
					<Link to="/help">
						<ComposeBody
							icon={<CircleHelp className="size-[1.125rem]" />}
							title="Help"
							hint="Guides for groups, expenses and splits"
						/>
					</Link>
				</DropdownMenuItem>

				{user ? (
					<DropdownMenuItem asChild className={COMPOSE_ITEM}>
						<Link to="/app/settings">
							<ComposeBody
								icon={<UserRound className="size-[1.125rem]" />}
								title="Account"
								hint="API keys and your details"
							/>
						</Link>
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem asChild className={COMPOSE_ITEM}>
						<Link to="/login">
							<ComposeBody
								icon={<LogIn className="size-[1.125rem]" />}
								title="Sign in"
								hint="Log in to your groups"
							/>
						</Link>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * Signed-in navigation. The masthead only carries identity and the theme, so
 * the destinations live down here where a thumb already is, with the one thing
 * you open the app to do in the middle.
 */
export function AppDock({ user }: { user: { name: string; email: string } }) {
	const { groupId } = useParams({ strict: false }) as { groupId?: string };
	const { pathname } = useLocation();
	const [composeOpen, setComposeOpen] = useState(false);
	const [profileOpen, setProfileOpen] = useState(false);

	const active = profileActive(pathname, true)
		? "account"
		: pathname.startsWith("/docs")
			? "docs"
			: pathname.startsWith("/app")
				? "groups"
				: null;

	return (
		<>
			<nav className="dock" aria-label="Primary">
				<DockItem to="/app" active={active === "groups"} label="Groups">
					<Wallet className={ICON} aria-hidden="true" />
				</DockItem>

				<ComposeButton
					groupId={groupId}
					open={composeOpen}
					onOpenChange={(next) => {
						setComposeOpen(next);
						if (next) setProfileOpen(false);
					}}
				/>

				<DockItem to="/docs" active={active === "docs"} label="Integrations">
					<Blocks className={ICON} aria-hidden="true" />
				</DockItem>

				<ProfileButton
					user={user}
					open={profileOpen}
					onOpenChange={(next) => {
						setProfileOpen(next);
						if (next) setComposeOpen(false);
					}}
					active={active === "account"}
				/>
			</nav>

			{/*
			 * Dims the page but not the dock, so the menu reads as rising out of
			 * it. It has to sit outside `.dock`, whose `translate` would otherwise
			 * make this fixed element resolve against the dock instead of the
			 * viewport. Radix treats a tap here as an outside click and closes.
			 */}
			{composeOpen || profileOpen ? (
				<div className="dock-scrim" aria-hidden="true" />
			) : null}
		</>
	);
}

/**
 * Signed-out navigation for the landing page, docs, auth and invite screens.
 * There is nothing to add yet, so the slots are go back, go home, and the
 * account menu — help, plus sign-in or your profile. When a session is already
 * live — someone reading docs while logged in, or accepting an invite — the
 * third slot uses the same avatar the app dock does.
 */
export function PublicDock({
	user: initialUser,
}: {
	user?: { name: string; email: string } | null;
} = {}) {
	const router = useRouter();
	const { pathname } = useLocation();
	const [user, setUser] = useState(initialUser ?? null);
	const [profileOpen, setProfileOpen] = useState(false);

	useEffect(() => {
		if (initialUser !== undefined) {
			setUser(initialUser);
			return;
		}
		let active = true;
		void loadSession().then(
			(session) => {
				if (active) setUser(session?.user ?? null);
			},
			() => {
				if (active) setUser(null);
			},
		);
		return () => {
			active = false;
		};
	}, [initialUser]);

	const accountActive = profileActive(pathname, Boolean(user));

	return (
		<>
			<nav className="dock" aria-label="Primary">
				<button
					type="button"
					className="dock-item"
					aria-label="Go back"
					title="Go back"
					onClick={() => router.history.back()}
				>
					<ArrowLeft className={ICON} aria-hidden="true" />
				</button>

				<DockItem to="/" active={pathname === "/"} label="Home">
					<House className={ICON} aria-hidden="true" />
				</DockItem>

				<ProfileButton
					user={user}
					open={profileOpen}
					onOpenChange={setProfileOpen}
					active={accountActive}
				/>
			</nav>

			{profileOpen ? <div className="dock-scrim" aria-hidden="true" /> : null}
		</>
	);
}
