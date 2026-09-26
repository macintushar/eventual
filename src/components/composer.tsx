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
import { ExpenseComposer } from "#/components/expense-composer";
import { GroupComposer } from "#/components/group-composer";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog";
import { Spinner } from "#/components/ui/spinner";
import { composerQueryOptions } from "#/lib/queries";

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
	const groupsQuery = useQuery({
		...composerQueryOptions,
		enabled: open.kind === "expense",
	});

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
				groupsQuery.isError ? (
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
				) : groupsQuery.data ? (
					<ExpenseComposer
						key={`expense-${token}`}
						open={shown}
						onOpenChange={(next) => {
							if (!next) close();
						}}
						groups={groupsQuery.data.groups}
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
