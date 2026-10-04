import { usePostHog } from "@posthog/react";
import {
	formatForDisplay,
	type Hotkey,
	useHotkey,
	useHotkeySequence,
} from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { defaultFilter } from "cmdk";
import {
	Blocks,
	BookOpen,
	CircleHelp,
	KeyRound,
	Logs,
	type LucideIcon,
	Moon,
	Plug,
	Receipt,
	Search,
	Sun,
	UserRound,
	UsersRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { useComposer } from "#/components/composer";
import { Button } from "#/components/ui/button";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "#/components/ui/command";
import { Kbd } from "#/components/ui/kbd";
import { analyticsEnabled } from "#/lib/analytics/client";
import { HELP_ARTICLES } from "#/lib/help";
import { groupDirectoryQueryOptions } from "#/lib/queries";

export type PaletteCommand = {
	/** Stable and free of user data: it is what analytics records. */
	id: string;
	title: string;
	icon: LucideIcon;
	/** Extra words that should find this row besides its title. */
	keywords?: string[];
	/** Steps of the hotkey that also runs this, shown as a hint on the row. */
	shortcut?: Hotkey[];
	run: () => void;
};

type Section = { heading: string; commands: PaletteCommand[] };

type Palette = {
	open: () => void;
	sections: Map<string, Section>;
};

const PaletteContext = createContext<Palette | null>(null);

function usePalette() {
	const palette = useContext(PaletteContext);
	if (!palette)
		throw new Error("The command palette is only available inside AppShell");
	return palette;
}

/**
 * Offers a page's own actions in the palette while the page is mounted. They
 * are listed first, under `heading`, since what you are looking at is the
 * likeliest thing you want to act on.
 *
 * The list lives in a ref rather than state: pages rebuild it every render,
 * and the palette only needs to read it when it opens.
 */
export function useCommands(heading: string, commands: PaletteCommand[]) {
	const { sections } = usePalette();
	const id = useId();

	useLayoutEffect(() => {
		sections.set(id, { heading, commands });
	});
	useEffect(() => () => void sections.delete(id), [sections, id]);
}

const RECENT_KEY = "eventual.recent-groups";
const RECENT_LIMIT = 8;

function readRecent(): string[] {
	try {
		const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/** Remembers the groups you visit, newest first, so the palette can lead with them. */
function useRememberGroup(groupId: string | undefined) {
	useEffect(() => {
		if (!groupId) return;
		const next = [groupId, ...readRecent().filter((id) => id !== groupId)];
		try {
			localStorage.setItem(
				RECENT_KEY,
				JSON.stringify(next.slice(0, RECENT_LIMIT)),
			);
		} catch {
			// Private mode or a full quota: the palette just falls back to A–Z.
		}
	}, [groupId]);
}

/**
 * Whether another dialog, sheet or menu is up. Shortcuts stand down while one
 * is: a stray `E` must not throw away a half-written expense by opening a
 * fresh composer over it.
 */
function layerOpen() {
	return Boolean(
		document.querySelector(
			'[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
		),
	);
}

type Row = {
	/** Unique within the palette; never searched, so it can carry ids. */
	value: string;
	keywords: string[];
	icon: LucideIcon;
	title: ReactNode;
	trailing?: ReactNode;
	onSelect: () => void;
};
type Block = { heading: string; rows: Row[] };

/*
 * Below this a match is letters scattered across a word, which reads as noise:
 * "goa" should find Goa trip, not Integrations.
 */
const MIN_SCORE = 0.05;

/**
 * Ranks rows ourselves rather than through cmdk, which sorts rows inside a
 * group but never reorders the groups — the best match could sit under three
 * weaker sections. Each keyword is scored on its own, so a search can't
 * assemble a match out of letters from several unrelated words.
 */
function rank(blocks: Block[], search: string) {
	return blocks
		.map((block) => {
			const rows = block.rows
				.map((row) => ({
					row,
					score: Math.max(
						...row.keywords.map((word) => defaultFilter(word, search)),
					),
				}))
				.filter((entry) => entry.score >= MIN_SCORE)
				.sort((a, b) => b.score - a.score);
			return {
				heading: block.heading,
				rows: rows.map((entry) => entry.row),
				best: rows[0]?.score ?? 0,
			};
		})
		.filter((block) => block.rows.length > 0)
		.sort((a, b) => b.best - a.best);
}

function Shortcut({ steps }: { steps: Hotkey[] }) {
	return (
		<CommandShortcut>
			{steps.map((step) => (
				<Kbd key={step}>{formatForDisplay(step)}</Kbd>
			))}
		</CommandShortcut>
	);
}

const GO_TO = [
	{
		id: "go.groups",
		title: "Groups",
		icon: Blocks,
		keywords: ["home", "dashboard", "balances"],
		shortcut: ["G", "H"] as Hotkey[],
		to: "/app" as const,
	},
	{
		id: "go.activity",
		title: "Activity",
		icon: Logs,
		keywords: ["history", "feed", "recent"],
		shortcut: ["G", "A"] as Hotkey[],
		to: "/app/activity" as const,
	},
	{
		id: "go.profile",
		title: "Profile settings",
		icon: UserRound,
		keywords: ["settings", "account", "name", "email", "password", "reminders"],
		shortcut: ["G", "S"] as Hotkey[],
		to: "/app/settings/profile" as const,
	},
	{
		id: "go.api-keys",
		title: "API keys",
		icon: KeyRound,
		keywords: ["token", "developer", "settings"],
		to: "/app/settings/api-keys" as const,
	},
	{
		id: "go.integrations",
		title: "Integration docs",
		icon: Plug,
		keywords: ["docs", "mcp", "api", "shortcuts", "claude"],
		to: "/docs" as const,
	},
	{
		id: "go.help",
		title: "Help center",
		icon: CircleHelp,
		keywords: ["support", "guide", "how"],
		to: "/help" as const,
	},
] satisfies (Omit<PaletteCommand, "run"> & { to: string })[];

/**
 * ⌘K / Ctrl+K from anywhere signed in. It reaches every page, every group and
 * both composers, plus whatever the current page offers through
 * `useCommands`. It only ever opens the composer, never saves anything itself:
 * money goes through the composer's review step however you got there.
 *
 * There is no open or close motion on a desktop (see `styles.css`): it is
 * summoned by a keystroke, often, and an animation only makes it feel late.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
	const navigate = useNavigate();
	const composer = useComposer();
	const analytics = usePostHog();
	const { resolvedTheme, setTheme } = useTheme();
	const { groupId: routeGroupId } = useParams({ strict: false }) as {
		groupId?: string;
	};

	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [recent, setRecent] = useState<string[]>([]);
	const sections = useRef(new Map<string, Section>()).current;
	/* Run once the palette has finished closing — see `onCloseAutoFocus`. */
	const pending = useRef<(() => void) | null>(null);

	useRememberGroup(routeGroupId);

	const dashboard = useQuery({ ...groupDirectoryQueryOptions, enabled: open });

	const show = useCallback(() => {
		setSearch("");
		setRecent(readRecent());
		setOpen(true);
	}, []);

	const track = useCallback(
		(command: string, source: "palette" | "hotkey") => {
			if (analyticsEnabled)
				analytics?.capture("command_run", { command, source });
		},
		[analytics],
	);

	const select = (command: string, run: () => void) => {
		track(command, "palette");
		pending.current = run;
		setOpen(false);
	};

	const hotkey = (command: string, run: () => void) => () => {
		if (open || layerOpen()) return;
		track(command, "hotkey");
		run();
	};

	useHotkey("Mod+K", () => {
		if (open) setOpen(false);
		else if (!layerOpen()) show();
	});
	useHotkey(
		"E",
		hotkey("create.expense", () => composer.expense()),
	);
	useHotkeySequence(
		["G", "H"],
		hotkey("go.groups", () => void navigate({ to: "/app" })),
	);
	useHotkeySequence(
		["G", "A"],
		hotkey("go.activity", () => void navigate({ to: "/app/activity" })),
	);
	useHotkeySequence(
		["G", "S"],
		hotkey("go.profile", () => void navigate({ to: "/app/settings/profile" })),
	);

	const groups = useMemo(() => {
		const list = dashboard.data?.groups ?? [];
		const rank = (id: string) => {
			const index = recent.indexOf(id);
			return index === -1 ? Number.POSITIVE_INFINITY : index;
		};
		return [...list].sort(
			(a, b) =>
				Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)) ||
				rank(a.id) - rank(b.id) ||
				a.name.localeCompare(b.name),
		);
	}, [dashboard.data, recent]);

	const palette = useMemo(() => ({ open: show, sections }), [show, sections]);
	const dark = resolvedTheme === "dark";
	const query = search.trim();

	const blocks: Block[] = open
		? [
				...[...sections.values()].map((section) => ({
					heading: section.heading,
					rows: section.commands.map((command) => ({
						value: `page:${command.id}`,
						keywords: [command.title, ...(command.keywords ?? [])],
						icon: command.icon,
						title: command.title,
						trailing: command.shortcut && <Shortcut steps={command.shortcut} />,
						onSelect: () => select(command.id, command.run),
					})),
				})),
				{
					heading: "Create",
					rows: [
						{
							value: "create.expense",
							keywords: ["New expense", "add expense", "split", "bill", "cost"],
							icon: Receipt,
							title: "New expense",
							trailing: <Shortcut steps={["E"]} />,
							onSelect: () =>
								select("create.expense", () => composer.expense()),
						},
						{
							value: "create.group",
							keywords: ["New group", "start group", "create group"],
							icon: UsersRound,
							title: "New group",
							onSelect: () => select("create.group", () => composer.group()),
						},
					],
				},
				{
					// At rest only the groups you were in last; every group is searchable.
					heading: query ? "Groups" : "Recent groups",
					rows: (query ? groups : groups.slice(0, 5)).map((group) => {
						return {
							value: `group:${group.id}`,
							keywords: [group.name],
							icon: Blocks,
							title: <span className="truncate">{group.name}</span>,
							trailing: (
								<span className="ml-auto shrink-0 text-xs text-muted-foreground">
									{group.archivedAt ? "Archived" : null}
								</span>
							),
							onSelect: () =>
								select(
									"group.open",
									() =>
										void navigate({
											to: "/app/groups/$groupId",
											params: { groupId: group.id },
										}),
								),
						};
					}),
				},
				{
					heading: "Go to",
					rows: [
						...GO_TO.map((item) => ({
							value: item.id,
							keywords: [item.title, ...(item.keywords ?? [])],
							icon: item.icon,
							title: item.title,
							trailing: "shortcut" in item && item.shortcut && (
								<Shortcut steps={item.shortcut} />
							),
							onSelect: () =>
								select(item.id, () => void navigate({ to: item.to })),
						})),
						// Guides only surface when asked for; they would crowd the
						// resting list.
						...(query
							? HELP_ARTICLES.map((article) => ({
									value: `help:${article.slug}`,
									keywords: [article.title, article.kicker, "help", "guide"],
									icon: BookOpen,
									title: article.title,
									onSelect: () =>
										select(
											"go.help-article",
											() =>
												void navigate({
													to: "/help/$slug",
													params: { slug: article.slug },
												}),
										),
								}))
							: []),
					],
				},
				{
					heading: "Preferences",
					rows: [
						{
							value: "theme.toggle",
							keywords: ["theme", "dark mode", "light mode", "appearance"],
							icon: dark ? Sun : Moon,
							title: dark ? "Switch to light theme" : "Switch to dark theme",
							onSelect: () =>
								select("theme.toggle", () => setTheme(dark ? "light" : "dark")),
						},
					],
				},
			]
		: [];
	const visible = query
		? rank(blocks, query)
		: blocks.filter((block) => block.rows.length > 0);

	return (
		<PaletteContext.Provider value={palette}>
			{children}

			<CommandDialog
				open={open}
				onOpenChange={setOpen}
				title="Search Eventual"
				description="Jump to a group or page, or start an expense."
				onCloseAutoFocus={(event) => {
					const run = pending.current;
					if (!run) return;
					pending.current = null;
					// Whatever runs next — a composer, a page — places focus itself.
					// Handing it back to the page first would pull it out of a
					// dialog that has just opened.
					event.preventDefault();
					run();
				}}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search groups, pages and actions…"
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="max-h-[min(26rem,60dvh)] p-1">
						<CommandEmpty className="px-4 [overflow-wrap:anywhere]">
							Nothing matches “{query}”.
						</CommandEmpty>
						{visible.map((block) => (
							<CommandGroup key={block.heading} heading={block.heading}>
								{block.rows.map((row) => (
									<CommandItem
										key={row.value}
										value={row.value}
										onSelect={row.onSelect}
									>
										<row.icon className="text-muted-foreground" />
										{row.title}
										{row.trailing}
									</CommandItem>
								))}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</CommandDialog>
		</PaletteContext.Provider>
	);
}

/**
 * The visible way in, for anyone who doesn't know the shortcut: a search field
 * on a desktop that teaches it, and an icon on a phone, where there is none.
 */
export function CommandPaletteTrigger() {
	const { open } = usePalette();
	// The modifier depends on the platform, which the server can't know.
	const [shortcut, setShortcut] = useState<string | null>(null);
	useEffect(() => setShortcut(formatForDisplay("Mod+K")), []);

	return (
		<>
			<Button
				variant="outline"
				className="press hidden w-56 justify-start rounded-full font-normal text-muted-foreground sm:inline-flex"
				onClick={open}
			>
				<Search data-icon="inline-start" />
				Search…
				{shortcut && <Kbd className="ml-auto">{shortcut}</Kbd>}
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="sm:hidden"
				aria-label="Search"
				onClick={open}
			>
				<Search data-icon="inline-start" />
			</Button>
		</>
	);
}
