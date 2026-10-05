import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type ComposerGroup,
	ExpenseComposer,
} from "#/components/expense-composer";
import { GroupComposer } from "#/components/group-composer";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog";
import { Spinner } from "#/components/ui/spinner";
import { composerQueryOptions, groupContextQueryOptions } from "#/lib/queries";

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
 *
 * Closing only flips `shown`; the last composer stays mounted with
 * `open={false}` so Radix can play its exit instead of the dialog vanishing
 * mid-frame. The next open bumps the key, which is what discards the draft.
 */
export function ComposerProvider({
	currentUserId,
	children,
}: {
	currentUserId: string;
	children: ReactNode;
}) {
	const navigate = useNavigate();
	const { groupId: routeGroupId } = useParams({ strict: false }) as {
		groupId?: string;
	};

	const [open, setOpen] = useState<Open>({ kind: "none" });
	const [shown, setShown] = useState(false);
	const [token, setToken] = useState(0);
	const tokenRef = useRef(0);
	const expenseOpen = shown && open.kind === "expense";
	const contextGroupId = open.kind === "expense" ? open.groupId : undefined;
	const groupsQuery = useQuery({
		...composerQueryOptions,
		enabled: expenseOpen,
	});
	/*
	 * Opened from inside a group, the page has almost always loaded that
	 * group's members already. Seeding the composer with them means it opens at
	 * once, and a slow or failed fetch of every group only matters for the
	 * group step, not for adding an expense to the group you are looking at.
	 */
	const contextQuery = useQuery({
		...groupContextQueryOptions(contextGroupId ?? ""),
		enabled: expenseOpen && Boolean(contextGroupId),
	});
	const seedGroup: ComposerGroup | undefined =
		// An archived group takes no new expenses, and the full list leaves it out.
		contextGroupId && contextQuery.data && !contextQuery.data.group.archivedAt
			? {
					id: contextQuery.data.group.id,
					name: contextQuery.data.group.name,
					members: contextQuery.data.group.members,
				}
			: undefined;
	// The group you're in always counts, even when a cached list predates
	// joining it or the full list hasn't arrived yet.
	const composerGroups = groupsQuery.data
		? seedGroup &&
			!groupsQuery.data.groups.some((group) => group.id === seedGroup.id)
			? [seedGroup, ...groupsQuery.data.groups]
			: groupsQuery.data.groups
		: seedGroup
			? [seedGroup]
			: undefined;

	const close = useCallback(() => setShown(false), []);

	const composer = useMemo<Composer>(
		() => ({
			group: () => {
				tokenRef.current += 1;
				setToken(tokenRef.current);
				setOpen({ kind: "group" });
				setShown(true);
			},
			expense: (options) => {
				tokenRef.current += 1;
				setToken(tokenRef.current);
				setOpen({ kind: "expense", groupId: options?.groupId ?? routeGroupId });
				setShown(true);
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
					open={shown}
					onOpenChange={(next) => {
						if (!next) close();
					}}
					onCreated={async (groupId) => {
						await navigate({ to: "/app/groups/$groupId", params: { groupId } });
					}}
				/>
			) : null}

			{open.kind === "expense" ? (
				groupsQuery.isError && !seedGroup ? (
					<Dialog open={shown} onOpenChange={close}>
						<DialogContent className="gap-3 sm:max-w-xl">
							<DialogTitle>Couldn't load your groups</DialogTitle>
							<p className="text-sm text-muted-foreground">
								{groupsQuery.error instanceof Error
									? groupsQuery.error.message
									: "Try again in a moment."}
							</p>
							<Button
								variant="outline"
								disabled={groupsQuery.isFetching}
								onClick={() => {
									void groupsQuery.refetch();
								}}
							>
								{groupsQuery.isFetching ? "Trying…" : "Try again"}
							</Button>
						</DialogContent>
					</Dialog>
				) : composerGroups ? (
					<ExpenseComposer
						key={`expense-${token}`}
						open={shown}
						onOpenChange={(next) => {
							if (!next) close();
						}}
						groups={composerGroups}
						currentUserId={currentUserId}
						defaultGroupId={open.groupId}
						onCreateGroup={composer.group}
						onSaved={async (groupId) => {
							if (groupId !== routeGroupId)
								await navigate({
									to: "/app/groups/$groupId",
									params: { groupId },
								});
						}}
					/>
				) : (
					<Dialog open={shown} onOpenChange={close}>
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
