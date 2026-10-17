import {
	BottomSheetModal,
	BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import { type Href, useRouter } from "expo-router";
import {
	ArrowLeft,
	Blocks,
	ChevronRight,
	Logs,
	type LucideIcon,
	Receipt,
	Search,
	Settings,
	UserRound,
	UsersRound,
	X,
} from "lucide-react-native";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, Pressable, ScrollView, TextInput, View } from "react-native";
import { useApi } from "../lib/session";
import { fonts, useTheme } from "../theme";
import { Body, Display } from "./brand";

type Command = {
	title: string;
	keywords?: string;
	icon: LucideIcon;
	href?: Href;
	run?: () => void;
	subtitle?: string;
};
export type ActionSheetHandle = { present: () => void };

/** System modal presentation, never a custom dock or an additional selected tab. */
export const ActionSheet = forwardRef<ActionSheetHandle>(
	function ActionSheet(_, ref) {
		const t = useTheme();
		const api = useApi();
		const router = useRouter();
		const sheet = useRef<BottomSheetModal>(null);
		const pending = useRef<Href | null>(null);
		const [open, setOpen] = useState(false);
		const [search, setSearch] = useState("");
		const [chooseGroup, setChooseGroup] = useState(false);
		const directory = useQuery({
			queryKey: ["group-directory"],
			queryFn: () => api.call("app.groupDirectory"),
			enabled: open,
			// A newly created/archived group must be reflected on the next opening.
			staleTime: 0,
		});
		useImperativeHandle(
			ref,
			() => ({
				present() {
					pending.current = null;
					setSearch("");
					setChooseGroup(false);
					setOpen(true);
					sheet.current?.present();
				},
			}),
			[],
		);

		function close(href?: Href) {
			pending.current = href ?? null;
			Keyboard.dismiss();
			sheet.current?.dismiss();
		}
		function onDismiss() {
			setOpen(false);
			const href = pending.current;
			pending.current = null;
			// Wait for native dismissal before pushing another modal composer.
			if (href) router.push(href);
		}
		const query = search.trim().toLocaleLowerCase();
		const matches = (command: Command) =>
			query
				.split(/\s+/)
				.every((word) =>
					`${command.title} ${command.keywords ?? ""}`
						.toLocaleLowerCase()
						.includes(word),
				);
		const groups = [...(directory.data?.groups ?? [])]
			.filter((group) => !chooseGroup || !group.archivedAt)
			.sort(
				(a, b) =>
					Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)) ||
					a.name.localeCompare(b.name),
			);
		const create: Command[] = [
			{
				title: "New expense",
				keywords: "add split bill cost",
				icon: Receipt,
				subtitle: "Choose a group",
				run: () => {
					setChooseGroup(true);
					setSearch("");
				},
			},
			{
				title: "New group",
				keywords: "start create",
				icon: UsersRound,
				href: "/new-group",
			},
		];
		const shortcuts: Command[] = [
			{
				title: "Groups",
				keywords: "home dashboard balances",
				icon: Blocks,
				href: "/",
			},
			{
				title: "Activity",
				keywords: "history feed recent",
				icon: Logs,
				href: "/activity",
			},
			{
				title: "Profile",
				keywords: "name photo email payment upi",
				icon: UserRound,
				href: "/account/profile",
			},
			{
				title: "Settings",
				keywords: "account appearance theme server",
				icon: Settings,
				href: "/account",
			},
		];
		const groupCommands: Command[] = groups.map((group) => ({
			title: group.name,
			icon: Blocks,
			subtitle: group.archivedAt ? "Archived" : undefined,
			href: {
				pathname: chooseGroup
					? "/group/[groupId]/expense/compose"
					: "/group/[groupId]",
				params: { groupId: group.id },
			},
		}));
		const sections = (
			chooseGroup
				? [{ title: "Choose a group", commands: groupCommands }]
				: [
						{ title: "Create", commands: create },
						{ title: "Go to", commands: shortcuts },
						{ title: "Your groups", commands: groupCommands },
					]
		).map((section) => ({
			...section,
			commands: section.commands.filter(matches),
		}));
		const count = sections.reduce(
			(sum, section) => sum + section.commands.length,
			0,
		);

		return (
			<BottomSheetModal
				ref={sheet}
				snapPoints={["70%", "95%"]}
				enableDynamicSizing={false}
				enablePanDownToClose
				onDismiss={onDismiss}
				backgroundStyle={{ backgroundColor: t.paper }}
			>
				<BottomSheetView
					style={{ flex: 1, backgroundColor: t.paper, paddingTop: 24 }}
				>
					<View style={{ paddingHorizontal: 20, gap: 16 }}>
						<View
							style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
						>
							{chooseGroup ? (
								<Pressable
									accessibilityRole="button"
									accessibilityLabel="Back to shortcuts"
									onPress={() => {
										setChooseGroup(false);
										setSearch("");
									}}
									style={{
										minWidth: 48,
										minHeight: 48,
										justifyContent: "center",
									}}
								>
									<ArrowLeft color={t.ink} size={22} />
								</Pressable>
							) : null}
							<View style={{ flex: 1 }}>
								<Display size={28}>
									{chooseGroup ? "New expense" : "Shortcuts"}
								</Display>
							</View>
							<Pressable
								accessibilityRole="button"
								accessibilityLabel="Close shortcuts"
								onPress={() => close()}
								style={{
									minWidth: 48,
									minHeight: 48,
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								<X color={t.ink} size={22} />
							</Pressable>
						</View>
						<View
							style={{
								flexDirection: "row",
								alignItems: "center",
								gap: 10,
								borderWidth: 1,
								borderColor: t.input,
								borderRadius: 14,
								paddingHorizontal: 14,
							}}
						>
							<Search color={t.mutedInk} size={20} accessible={false} />
							<TextInput
								value={search}
								onChangeText={setSearch}
								accessibilityLabel={
									chooseGroup ? "Search groups" : "Search shortcuts and groups"
								}
								placeholder={
									chooseGroup
										? "Search groups"
										: "Search groups, profile, settings…"
								}
								placeholderTextColor={t.mutedInk}
								autoCorrect={false}
								autoCapitalize="none"
								returnKeyType="search"
								clearButtonMode="never"
								onFocus={() => sheet.current?.expand()}
								style={{
									flex: 1,
									minHeight: 48,
									fontFamily: fonts.body,
									fontSize: 16,
									color: t.ink,
								}}
							/>
							{search ? (
								<Pressable
									accessibilityRole="button"
									accessibilityLabel="Clear search"
									onPress={() => setSearch("")}
									style={{
										minWidth: 48,
										minHeight: 48,
										alignItems: "center",
										justifyContent: "center",
									}}
								>
									<X color={t.mutedInk} size={18} accessible={false} />
								</Pressable>
							) : null}
						</View>
					</View>
					<ScrollView
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="interactive"
						automaticallyAdjustKeyboardInsets
						contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
					>
						{sections
							.filter((section) => section.commands.length)
							.map((section) => (
								<View key={section.title} style={{ gap: 6 }}>
									<Body
										tone="muted"
										size={13}
										weight="semibold"
										accessibilityRole="header"
									>
										{section.title}
									</Body>
									{section.commands.map((command) => (
										<Pressable
											key={command.title + JSON.stringify(command.href)}
											accessibilityRole="button"
											accessibilityLabel={`${command.title}${command.subtitle ? `, ${command.subtitle}` : ""}`}
											onPress={() =>
												command.run ? command.run() : close(command.href)
											}
											style={({ pressed }) => ({
												flexDirection: "row",
												alignItems: "center",
												gap: 14,
												minHeight: 56,
												padding: 10,
												borderRadius: 14,
												backgroundColor: pressed ? t.muted : t.paper,
											})}
										>
											<command.icon
												color={t.ink}
												size={22}
												accessible={false}
											/>
											<View style={{ flex: 1, gap: 2 }}>
												<Body weight="medium">{command.title}</Body>
												{command.subtitle ? (
													<Body tone="muted" size={13}>
														{command.subtitle}
													</Body>
												) : null}
											</View>
											<ChevronRight
												color={t.mutedInk}
												size={18}
												accessible={false}
											/>
										</Pressable>
									))}
								</View>
							))}
						{directory.isPending ? (
							<Body tone="muted" accessibilityLiveRegion="polite">
								Loading groups…
							</Body>
						) : null}
						{directory.isError ? (
							<View style={{ gap: 8 }}>
								<Body tone="muted">
									Couldn’t load groups. Check your connection.
								</Body>
								<Pressable
									accessibilityRole="button"
									onPress={() => void directory.refetch()}
									style={{ minHeight: 48, justifyContent: "center" }}
								>
									<Body weight="semibold">Retry groups</Body>
								</Pressable>
							</View>
						) : null}
						{!count && !directory.isPending && !directory.isError ? (
							<View style={{ gap: 8 }}>
								<Body accessibilityLiveRegion="polite">
									{query
										? `No results for “${search.trim()}”.`
										: "No active groups yet."}
								</Body>
								<Body tone="muted">
									{query
										? "Try another name or shortcut."
										: "Create a group before adding an expense."}
								</Body>
								{!query && chooseGroup ? (
									<Pressable
										accessibilityRole="button"
										onPress={() => close("/new-group")}
										style={{ minHeight: 48, justifyContent: "center" }}
									>
										<Body weight="semibold">New group</Body>
									</Pressable>
								) : null}
							</View>
						) : null}
					</ScrollView>
				</BottomSheetView>
			</BottomSheetModal>
		);
	},
);
