import { useQuery, useQueryClient } from "@tanstack/react-query";
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
	LogOut,
	Logs,
	Plus,
	Receipt,
	Settings,
	UserRound,
	UsersRound,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useComposer } from "#/components/composer";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { MemberAvatar } from "#/components/member-avatar";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { authClient } from "#/lib/auth-client";
import { sessionQueryOptions } from "#/lib/queries";
import { clearSession } from "#/lib/session";
import { cn } from "#/lib/utils";

const ICON = "size-[1.375rem]";

/**
 * The floating pill: a still row of 44px thumb targets. It used to swell
 * toward the cursor like the macOS dock, but navigation you do fifty times a
 * day should not perform for you every time.
 */
function Dock({
	menuOpen,
	children,
}: {
	/** An open menu hides the slot labels, which would sit on top of it. */
	menuOpen: boolean;
	children: ReactNode;
}) {
	return (
		<nav
			className="dock group/dock"
			aria-label="Primary"
			data-menu-open={menuOpen}
		>
			{children}
		</nav>
	);
}

/**
 * One fixed 44px position in the dock. It owns the label; whatever control
 * sits inside fills it. The label names an icon-only slot when a mouse rests
 * on it or keyboard focus lands in it. It is decoration for sighted users —
 * the control inside carries its own accessible name.
 */
function DockSlot({
	label,
	className,
	children,
}: {
	label: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("dock-slot group/slot", className)}>
			<span
				className={cn(
					"dock-label -translate-x-1/2 translate-y-1.5 opacity-0 transition-[opacity,translate] duration-150 motion-reduce:translate-y-0",
					"group-hover/slot:translate-y-0 group-hover/slot:opacity-100",
					"group-has-[:focus-visible]/slot:translate-y-0 group-has-[:focus-visible]/slot:opacity-100",
					"group-data-[menu-open=true]/dock:opacity-0",
				)}
				aria-hidden="true"
			>
				{label}
			</span>
			{children}
		</div>
	);
}

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
		<DockSlot label={label}>
			<Link
				{...link}
				className="dock-item"
				data-active={active}
				aria-label={label}
				aria-current={active ? "page" : undefined}
			>
				{children}
			</Link>
		</DockSlot>
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

type DockUser = { name: string; email: string; image?: string | null };

const COMPOSE_ITEM = "gap-3 rounded-xl p-2.5 [&_svg]:text-foreground";

function profileActive(pathname: string, signedIn: boolean) {
	if (pathname.startsWith("/help")) return true;
	if (signedIn) return pathname.startsWith("/app/settings");
	return pathname === "/login" || pathname === "/signup";
}

/**
 * The dock's centre button. Inside a group there is only one likely thing to
 * start, so it opens the expense composer for that group straight away;
 * everywhere else it opens a menu offering both an expense and a group.
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

	if (groupId)
		return (
			<DockSlot label="New expense" className="mx-0.5">
				<Button
					size="icon"
					className="press size-full rounded-full"
					aria-label="New expense in this group"
					onClick={() => composer.expense({ groupId })}
				>
					<Plus className={ICON} aria-hidden="true" />
				</Button>
			</DockSlot>
		);

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DockSlot label="New" className="mx-0.5">
				<DropdownMenuTrigger asChild>
					<Button
						size="icon"
						className="press size-full rounded-full"
						aria-label="New expense or group"
					>
						{/* The plus turns into a close mark, so the button reads as the
						    same object in both states rather than swapping icons. */}
						<Plus
							aria-hidden="true"
							className={cn(
								ICON,
								"transition-transform duration-200 ease-(--ease-out-soft) motion-reduce:transition-none",
								open && "rotate-45",
							)}
						/>
					</Button>
				</DropdownMenuTrigger>
			</DockSlot>

			<DropdownMenuContent
				side="top"
				align="center"
				sideOffset={14}
				className="dock-menu"
			>
				<DropdownMenuItem
					className={COMPOSE_ITEM}
					onSelect={() => composer.expense()}
				>
					<ComposeBody
						icon={<Receipt className="size-[1.125rem]" />}
						title="New expense"
						hint="Pick a group and split"
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
 * Ends the session and drops every account-scoped query with it. Resolves
 * `false` when sign-out failed, so the confirmation stays up.
 */
function useSignOut() {
	const router = useRouter();
	const queryClient = useQueryClient();

	return async () => {
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
			return false;
		}
		clearSession(queryClient);
		await router.navigate({ to: "/" });
		return true;
	};
}

/**
 * The dock's last slot, and the only account menu in the app. It used to share
 * the job with an avatar in the masthead's top-right corner — the hardest place
 * on a phone to reach, and gone whenever the header slid away on scroll — so
 * who you are, settings, help and sign-out all live down here, under the thumb.
 */
function ProfileButton({
	user,
	open,
	onOpenChange,
	active,
}: {
	user?: DockUser | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	active?: boolean;
}) {
	const signOut = useSignOut();
	const [confirmingSignOut, setConfirmingSignOut] = useState(false);

	return (
		<>
			<DropdownMenu open={open} onOpenChange={onOpenChange}>
				<DockSlot label="Account">
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="dock-item"
							data-active={active || open}
							aria-label="Account menu"
							aria-current={active ? "page" : undefined}
						>
							{user ? (
								<MemberAvatar
									name={user.name}
									seed={user.email}
									image={user.image}
									className="size-[1.625rem] text-[9px]"
								/>
							) : (
								<UserRound className={ICON} aria-hidden="true" />
							)}
						</button>
					</DropdownMenuTrigger>
				</DockSlot>

				<DropdownMenuContent
					side="top"
					align="end"
					sideOffset={14}
					className="dock-menu"
				>
					{user && (
						<>
							<DropdownMenuLabel className="flex items-center gap-3 p-2.5">
								<MemberAvatar
									name={user.name}
									seed={user.email}
									image={user.image}
									className="size-10"
								/>
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="truncate font-medium">{user.name}</span>
									<span className="truncate text-xs font-normal text-muted-foreground">
										{user.email}
									</span>
								</span>
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{/* Profile and API keys are tabs of one settings page, so one
							    row reaches both and the menu stays short enough to clear
							    the dock on a landscape phone. */}
							<DropdownMenuItem asChild className={COMPOSE_ITEM}>
								<Link to="/app/settings/profile">
									<ComposeBody
										icon={<Settings className="size-[1.125rem]" />}
										title="Settings"
										hint="Your profile and API keys"
									/>
								</Link>
							</DropdownMenuItem>
						</>
					)}

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
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								className={COMPOSE_ITEM}
								onSelect={() => setConfirmingSignOut(true)}
							>
								<span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10">
									<LogOut className="size-[1.125rem]" />
								</span>
								<span className="font-medium">Sign out</span>
							</DropdownMenuItem>
						</>
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

			{/* Outside the menu, which has already closed by the time this asks. */}
			<ConfirmDialog
				open={confirmingSignOut}
				onOpenChange={setConfirmingSignOut}
				media={<LogOut />}
				title="Sign out?"
				description="You'll need to sign in again to see your groups."
				confirmLabel="Sign out"
				onConfirm={signOut}
			/>
		</>
	);
}

/**
 * Signed-in navigation. The masthead only carries the wordmark and the theme,
 * so the destinations and the account live down here where a thumb already is, with the one thing
 * you open the app to do in the middle.
 */
export function AppDock({ user }: { user: DockUser }) {
	const { groupId } = useParams({ strict: false }) as { groupId?: string };
	const { pathname } = useLocation();
	const [composeOpen, setComposeOpen] = useState(false);
	// Inside a group the button opens the composer directly and has no menu,
	// so a change of group closes any menu left open as the route changed.
	const [composeScope, setComposeScope] = useState(groupId);
	if (composeScope !== groupId) {
		setComposeScope(groupId);
		setComposeOpen(false);
	}
	const [profileOpen, setProfileOpen] = useState(false);

	const active = profileActive(pathname, true)
		? "account"
		: pathname.startsWith("/app/activity")
			? "activity"
			: pathname.startsWith("/app")
				? "groups"
				: null;

	return (
		<>
			<Dock menuOpen={composeOpen || profileOpen}>
				<DockItem to="/app" active={active === "groups"} label="Groups">
					<Blocks className={ICON} aria-hidden="true" />
				</DockItem>

				<DockItem
					to="/app/activity"
					active={active === "activity"}
					label="Activity"
				>
					<Logs className={ICON} aria-hidden="true" />
				</DockItem>

				<ComposeButton
					groupId={groupId}
					open={composeOpen}
					onOpenChange={(next) => {
						setComposeOpen(next);
						if (next) setProfileOpen(false);
					}}
				/>

				<ProfileButton
					user={user}
					open={profileOpen}
					onOpenChange={(next) => {
						setProfileOpen(next);
						if (next) setComposeOpen(false);
					}}
					active={active === "account"}
				/>
			</Dock>

			{/*
			 * Dims the page but not the dock, so the menu reads as rising out of
			 * it. It has to sit outside `.dock`, whose `translate` would otherwise
			 * make this fixed element resolve against the dock instead of the
			 * viewport. Radix treats a tap here as an outside click and closes.
			 * Always mounted, so it can fade out alongside the menu instead of
			 * vanishing the frame the menu starts to close.
			 */}
			<div
				className="dock-scrim"
				data-open={composeOpen || profileOpen}
				aria-hidden="true"
			/>
		</>
	);
}

/**
 * Signed-out navigation for the landing page, docs, auth and invite screens.
 * There is nothing to add yet, so the slots are go back, go home, and the
 * account menu — help, plus sign-in, or settings and sign-out. When a session is already
 * live — someone reading docs while logged in, or accepting an invite — the
 * third slot uses the same avatar the app dock does.
 */
export function PublicDock({
	user: initialUser,
}: {
	user?: DockUser | null;
} = {}) {
	const router = useRouter();
	const { pathname } = useLocation();
	const [profileOpen, setProfileOpen] = useState(false);
	const session = useQuery({
		...sessionQueryOptions,
		enabled: initialUser === undefined && !import.meta.env.SSR,
	});
	const user =
		initialUser !== undefined ? initialUser : (session.data?.user ?? null);

	const accountActive = profileActive(pathname, Boolean(user));

	return (
		<>
			<Dock menuOpen={profileOpen}>
				<DockSlot label="Back">
					<button
						type="button"
						className="dock-item"
						aria-label="Go back"
						onClick={() => router.history.back()}
					>
						<ArrowLeft className={ICON} aria-hidden="true" />
					</button>
				</DockSlot>

				<DockItem to="/" active={pathname === "/"} label="Home">
					<House className={ICON} aria-hidden="true" />
				</DockItem>

				<ProfileButton
					user={user}
					open={profileOpen}
					onOpenChange={setProfileOpen}
					active={accountActive}
				/>
			</Dock>

			<div className="dock-scrim" data-open={profileOpen} aria-hidden="true" />
		</>
	);
}
