import {
	Link,
	useLocation,
	useParams,
	useRouter,
} from "@tanstack/react-router";
import {
	ArrowLeft,
	Blocks,
	House,
	Plus,
	UserRound,
	Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

import { MemberAvatar } from "#/components/member-avatar";
import { Button } from "#/components/ui/button";

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

/**
 * Signed-in navigation. The masthead only carries identity and the theme, so
 * the destinations live down here where a thumb already is. The middle slot is
 * the one action a person opens the app to take, and it follows context:
 * inside a group it adds an expense, everywhere else it starts a group.
 */
export function AppDock({ user }: { user: { name: string; email: string } }) {
	const { groupId } = useParams({ strict: false }) as { groupId?: string };
	const { pathname } = useLocation();

	const active = pathname.startsWith("/app/settings")
		? "account"
		: pathname.startsWith("/docs")
			? "docs"
			: pathname.startsWith("/app")
				? "groups"
				: null;

	return (
		<nav className="dock" aria-label="Primary">
			<DockItem to="/app" active={active === "groups"} label="Groups">
				<Wallet className={ICON} aria-hidden="true" />
			</DockItem>

			<Button
				size="icon"
				className="press mx-0.5 size-11 shrink-0"
				aria-label={groupId ? "Add expense" : "New group"}
				asChild
			>
				{groupId ? (
					<Link
						to="/app/groups/$groupId/expenses/new"
						params={{ groupId }}
						aria-label="Add expense"
					>
						<Plus className={ICON} />
					</Link>
				) : (
					<Link to="/app/groups/new" aria-label="New group">
						<Plus className={ICON} />
					</Link>
				)}
			</Button>

			<DockItem to="/docs" active={active === "docs"} label="Integrations">
				<Blocks className={ICON} aria-hidden="true" />
			</DockItem>

			<DockItem
				to="/app/settings"
				active={active === "account"}
				label="Account"
			>
				<MemberAvatar
					name={user.name}
					seed={user.email}
					className="size-[1.625rem] text-[9px]"
				/>
			</DockItem>
		</nav>
	);
}

/**
 * Signed-out navigation for the landing page, docs, auth and invite screens.
 * There is nothing to add and no account yet, so the slots are the three moves
 * that always make sense: go back, go home, or sign in.
 */
export function PublicDock() {
	const router = useRouter();
	const { pathname } = useLocation();

	return (
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

			<DockItem
				to="/login"
				active={pathname === "/login" || pathname === "/signup"}
				label="Sign in"
			>
				<UserRound className={ICON} aria-hidden="true" />
			</DockItem>
		</nav>
	);
}
