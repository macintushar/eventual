import { useQuery } from "@tanstack/react-query";
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
	Logs,
	Plug,
	Plus,
	Receipt,
	UserRound,
	UsersRound,
} from "lucide-react";
import {
	AnimatePresence,
	type MotionValue,
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { useComposer } from "#/components/composer";
import { MemberAvatar } from "#/components/member-avatar";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { sessionQueryOptions } from "#/lib/queries";
import { cn } from "#/lib/utils";

const ICON = "size-[1.375rem]";

/* Slot size at rest (the 44px thumb target) and right under the cursor. */
const SLOT = 44;
const SLOT_PEAK = 64;
/* How far either side of the cursor a slot still feels the pull. */
const REACH = 120;
const SPRING = { mass: 0.1, stiffness: 170, damping: 14 };

/** Cursor x inside the dock, or Infinity when there is no cursor to follow. */
const DockPointer = createContext<MotionValue<number> | null>(null);
/** The slot's current growth, so its glyph can scale with it. */
const SlotScale = createContext<MotionValue<number> | null>(null);

/**
 * The floating pill. On a mouse, slots swell toward the cursor like the macOS
 * dock; touch never feeds the pointer, so on a phone it stays a still row of
 * thumb targets.
 */
function Dock({
	menuOpen,
	children,
}: {
	/** An open menu freezes the dock, since Radix swallows the pointer. */
	menuOpen: boolean;
	children: ReactNode;
}) {
	const pointerX = useMotionValue(Number.POSITIVE_INFINITY);
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		if (menuOpen) pointerX.set(Number.POSITIVE_INFINITY);
	}, [menuOpen, pointerX]);

	return (
		<DockPointer.Provider value={pointerX}>
			<nav
				className="dock"
				aria-label="Primary"
				data-menu-open={menuOpen}
				onPointerMove={(event) => {
					if (event.pointerType !== "mouse" || reduceMotion || menuOpen) return;
					pointerX.set(event.clientX);
				}}
				onPointerLeave={() => pointerX.set(Number.POSITIVE_INFINITY)}
			>
				{children}
			</nav>
		</DockPointer.Provider>
	);
}

/**
 * One magnifying position in the dock. It owns the size and the hover label;
 * whatever control sits inside fills it.
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
	const pointerX = useContext(DockPointer);
	const fallbackX = useMotionValue(Number.POSITIVE_INFINITY);
	const ref = useRef<HTMLDivElement>(null);
	const [hovered, setHovered] = useState(false);
	const reduceMotion = useReducedMotion();

	const distance = useTransform(pointerX ?? fallbackX, (x) => {
		const bounds = ref.current?.getBoundingClientRect();
		return bounds
			? x - bounds.left - bounds.width / 2
			: Number.POSITIVE_INFINITY;
	});
	const size = useSpring(
		useTransform(distance, [-REACH, 0, REACH], [SLOT, SLOT_PEAK, SLOT]),
		SPRING,
	);
	const scale = useTransform(size, (value) => value / SLOT);

	return (
		<SlotScale.Provider value={scale}>
			<motion.div
				ref={ref}
				className={cn("dock-slot", className)}
				style={{ width: size, height: size }}
				onPointerEnter={(event) => setHovered(event.pointerType === "mouse")}
				onPointerLeave={() => setHovered(false)}
				onPointerDown={() => setHovered(false)}
			>
				<AnimatePresence>
					{hovered && (
						<motion.span
							className="dock-label"
							aria-hidden="true"
							initial={{ opacity: 0, y: reduceMotion ? 0 : 6, x: "-50%" }}
							animate={{ opacity: 1, y: 0, x: "-50%" }}
							exit={{ opacity: 0, y: reduceMotion ? 0 : 2, x: "-50%" }}
							transition={{ duration: 0.16 }}
						>
							{label}
						</motion.span>
					)}
				</AnimatePresence>
				{children}
			</motion.div>
		</SlotScale.Provider>
	);
}

/** Scales an icon or avatar along with its slot, so it grows rather than floats. */
function DockGlyph({ children }: { children: ReactNode }) {
	const scale = useContext(SlotScale);
	return (
		<motion.span
			className="grid place-items-center"
			style={{ scale: scale ?? 1 }}
		>
			{children}
		</motion.span>
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
				<DockGlyph>{children}</DockGlyph>
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
			<DockSlot label="New" className="mx-0.5">
				<DropdownMenuTrigger asChild>
					<Button
						size="icon"
						className="press size-full rounded-full"
						aria-label="New expense or group"
					>
						<DockGlyph>
							{/* The plus turns into a close mark, so the button reads as the
							    same object in both states rather than swapping icons. */}
							<Plus
								className={cn(
									ICON,
									"transition-transform duration-200 ease-(--ease-out-soft) motion-reduce:transition-none",
									open && "rotate-45",
								)}
							/>
						</DockGlyph>
					</Button>
				</DropdownMenuTrigger>
			</DockSlot>

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
			<DockSlot label="Account">
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="dock-item"
						data-active={active || open}
						aria-label="Account menu"
						aria-current={active ? "page" : undefined}
					>
						<DockGlyph>
							{user ? (
								<MemberAvatar
									name={user.name}
									seed={user.email}
									className="size-[1.625rem] text-[9px]"
								/>
							) : (
								<UserRound className={ICON} aria-hidden="true" />
							)}
						</DockGlyph>
					</button>
				</DropdownMenuTrigger>
			</DockSlot>

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
						<Link to="/app/settings/profile">
							<ComposeBody
								icon={<UserRound className="size-[1.125rem]" />}
								title="Account"
								hint="Your profile and API keys"
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

				<DockItem to="/docs" active={active === "docs"} label="Integrations">
					<Plug className={ICON} aria-hidden="true" />
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
						<DockGlyph>
							<ArrowLeft className={ICON} aria-hidden="true" />
						</DockGlyph>
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
