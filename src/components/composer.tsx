import { useNavigate, useParams, useRouter } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import {
	type ComposerGroup,
	ExpenseComposer,
} from "#/components/expense-composer";
import { GroupComposer } from "#/components/group-composer";
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog";
import { Spinner } from "#/components/ui/spinner";
import { getComposerFn } from "#/server/fn/app";

type Composer = {
	/** Start a group. */
	group: () => void;
	/**
	 * Add an expense. Without a `groupId` the group in the current route is used,
	 * and failing that the composer opens on its group step.
	 */
	expense: (options?: { groupId?: string }) => void;
};

const ComposerContext = createContext<Composer | null>(null);

/** The app-wide composers. Only available inside `AppShell`. */
export function useComposer() {
	const composer = useContext(ComposerContext);
	if (!composer)
		throw new Error("useComposer must be used inside a ComposerProvider");
	return composer;
}

type Open =
	| { kind: "none" }
	| { kind: "group" }
	| { kind: "expense"; groupId?: string };

/**
 * Hosts the group and expense composers for every signed-in page, so the dock
 * can start either one from wherever you are. Creating things used to mean
 * leaving the page you were on for a form and being redirected back; now the
 * page stays put underneath.
 *
 * Each open remounts the composer — a draft you abandoned should not be waiting
 * for you the next time, half-filled, with someone else's numbers in it.
 */
export function ComposerProvider({
	currentUserId,
	children,
}: {
	currentUserId: string;
	children: ReactNode;
}) {
	const router = useRouter();
	const navigate = useNavigate();
	const { groupId: routeGroupId } = useParams({ strict: false }) as {
		groupId?: string;
	};

	const [open, setOpen] = useState<Open>({ kind: "none" });
	const [token, setToken] = useState(0);
	const [groups, setGroups] = useState<ComposerGroup[] | null>(null);
	const tokenRef = useRef(0);

	const close = useCallback(() => setOpen({ kind: "none" }), []);

	const composer = useMemo<Composer>(
		() => ({
			group: () => {
				tokenRef.current += 1;
				setToken(tokenRef.current);
				setOpen({ kind: "group" });
			},
			expense: (options) => {
				tokenRef.current += 1;
				const requestToken = tokenRef.current;
				setToken(requestToken);
				setGroups(null);
				setOpen({ kind: "expense", groupId: options?.groupId ?? routeGroupId });
				// The dock reaches this from any page, so the composer cannot assume a
				// group loader has run — it fetches the groups it offers itself. If the
				// user opens a different composer before this resolves, the token has
				// since moved on, so ignore the stale result instead of clobbering
				// whatever is open now.
				getComposerFn().then(
					(data) => {
						if (tokenRef.current === requestToken) setGroups(data.groups);
					},
					(error: unknown) => {
						if (tokenRef.current !== requestToken) return;
						toast.error(
							error instanceof Error
								? error.message
								: "Could not load your groups",
						);
						setOpen({ kind: "none" });
					},
				);
			},
		}),
		[routeGroupId],
	);

	return (
		<ComposerContext.Provider value={composer}>
			{children}

			{open.kind === "group" ? (
				<GroupComposer
					key={`group-${token}`}
					open
					onOpenChange={(next) => {
						if (!next) close();
					}}
					onCreated={async (groupId) => {
						await router.invalidate();
						await navigate({ to: "/app/groups/$groupId", params: { groupId } });
					}}
				/>
			) : null}

			{open.kind === "expense" ? (
				groups ? (
					<ExpenseComposer
						key={`expense-${token}`}
						open
						onOpenChange={(next) => {
							if (!next) close();
						}}
						groups={groups}
						currentUserId={currentUserId}
						defaultGroupId={open.groupId}
						onCreateGroup={composer.group}
						onSaved={async (groupId) => {
							await router.invalidate();
							if (groupId !== routeGroupId)
								await navigate({
									to: "/app/groups/$groupId",
									params: { groupId },
								});
						}}
					/>
				) : (
					<Dialog open onOpenChange={close}>
						<DialogContent
							showCloseButton={false}
							className="items-center justify-items-center gap-3 py-10 sm:max-w-xl"
						>
							<DialogTitle className="sr-only">Add an expense</DialogTitle>
							<Spinner className="size-6 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">Loading groups…</p>
						</DialogContent>
					</Dialog>
				)
			) : null}
		</ComposerContext.Provider>
	);
}
