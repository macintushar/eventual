import { can } from "@eventual/schemas/permissions";
import { isEventualApiError } from "@eventual/sdk";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pencil, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import {
	Body,
	Card,
	Display,
	Field,
	FormMessage,
	GlassButton,
	Heading,
	Screen,
} from "../../../../../components/brand";
import { Checkbox } from "../../../../../components/checkbox";
import { idempotencyKey } from "../../../../../lib/mutations";
import {
	useGroupContext,
	useRefreshAfterWrite,
} from "../../../../../lib/queries";
import { useApi } from "../../../../../lib/session";
import { useTheme } from "../../../../../theme";

const errorText = (cause: unknown, fallback: string) =>
	isEventualApiError(cause) ? cause.message : fallback;

const plural = (count: number, one: string, many: string) =>
	`${count} ${count === 1 ? one : many}`;

export default function CategoryRules() {
	const api = useApi();
	const t = useTheme();
	const router = useRouter();
	const refresh = useRefreshAfterWrite();
	const { groupId } = useLocalSearchParams<{ groupId: string }>();
	const context = useGroupContext(groupId);
	const rules = useQuery({
		queryKey: ["group", groupId, "categories"],
		queryFn: () => api.call("category.list", { groupId }),
	});

	// `editing` is a rule id, or "new" for the add form, or null when closed.
	const [editing, setEditing] = useState<string | null>(null);
	const [pattern, setPattern] = useState("");
	const [category, setCategory] = useState("");
	const [priority, setPriority] = useState("0");
	const [applyToExisting, setApplyToExisting] = useState(true);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	function close() {
		setEditing(null);
		setPattern("");
		setCategory("");
		setPriority("0");
		setApplyToExisting(true);
	}

	const save = useMutation({
		mutationFn: () => {
			const input = {
				groupId,
				pattern: pattern.trim(),
				category: category.trim(),
				priority: Number.parseInt(priority, 10) || 0,
			};
			return editing === "new"
				? api.call(
						"category.create",
						{ ...input, applyToExisting },
						{ idempotencyKey: idempotencyKey() },
					)
				: api.call(
						"category.update",
						{ ...input, ruleId: editing ?? "" },
						{ idempotencyKey: idempotencyKey() },
					);
		},
		onMutate: () => {
			setError("");
			setMessage("");
		},
		onSuccess: async (result) => {
			const recategorized =
				"recategorized" in result ? Number(result.recategorized) : 0;
			setMessage(
				editing === "new"
					? recategorized
						? `Rule added. ${plural(recategorized, "expense", "expenses")} updated.`
						: "Rule added."
					: "Rule saved.",
			);
			close();
			await refresh(groupId);
		},
		onError: (cause) => setError(errorText(cause, "Couldn’t save the rule.")),
	});
	const remove = useMutation({
		mutationFn: (ruleId: string) =>
			api.call(
				"category.delete",
				{ groupId, ruleId },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => {
			setError("");
			setMessage("");
		},
		onSuccess: async () => {
			setMessage("Rule deleted.");
			await refresh(groupId);
		},
		onError: (cause) => setError(errorText(cause, "Couldn’t delete the rule.")),
	});

	const group = context.data?.group;
	if (!group)
		return (
			<Screen edges={["left", "right"]}>
				{context.isError ? (
					<Card>
						<Heading>Couldn’t load this group</Heading>
						<GlassButton
							label="Try again"
							onPress={() => void context.refetch()}
						/>
					</Card>
				) : (
					<ActivityIndicator style={{ marginTop: 40 }} />
				)}
			</Screen>
		);

	const archived = Boolean(group.archivedAt);
	const canAdd = !archived && can(group.myRole, "category", "create");
	const canEditRule = !archived && can(group.myRole, "category", "update");
	const canDelete = !archived && can(group.myRole, "category", "delete");
	const canReview = !archived && can(group.myRole, "expense", "update");
	const sorted = [...(rules.data ?? [])].sort(
		(a, b) => b.priority - a.priority || a.pattern.localeCompare(b.pattern),
	);
	const valid =
		pattern.trim() !== "" &&
		category.trim() !== "" &&
		/^-?\d*$/.test(priority.trim());

	function startEdit(rule: (typeof sorted)[number]) {
		setMessage("");
		setError("");
		setEditing(rule.id);
		setPattern(rule.pattern);
		setCategory(rule.category);
		setPriority(String(rule.priority));
	}

	function confirmDelete(rule: (typeof sorted)[number]) {
		Alert.alert(
			`Delete the “${rule.pattern}” rule?`,
			"Expenses keep the category they already have.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: () => remove.mutate(rule.id),
				},
			],
		);
	}

	return (
		<Screen tabBar edges={["left", "right"]}>
			<Display size={32}>Category rules</Display>
			<Body tone="muted" size={15}>
				New expenses get a category when the description contains a rule’s
				phrase. The highest priority wins, and rules beat the built-in keywords.
			</Body>

			{archived ? (
				<Body tone="muted" size={15}>
					This group is archived, so rules are read-only.
				</Body>
			) : null}

			<Card>
				<Heading>Rules</Heading>
				{rules.isPending ? (
					<ActivityIndicator />
				) : rules.isError ? (
					<>
						<Body tone="muted" size={15}>
							Couldn’t load the rules.
						</Body>
						<GlassButton
							label="Try again"
							onPress={() => void rules.refetch()}
						/>
					</>
				) : sorted.length === 0 ? (
					<Body tone="muted" size={15}>
						No rules yet. Built-in keywords like “coffee” and “uber” still
						apply.
					</Body>
				) : (
					<View style={{ gap: 4 }}>
						{sorted.map((rule) => (
							<View
								key={rule.id}
								style={{
									flexDirection: "row",
									alignItems: "center",
									gap: 12,
									minHeight: 56,
								}}
							>
								<View style={{ flex: 1 }}>
									<Body weight="medium" numberOfLines={1}>
										{`“${rule.pattern}” → ${rule.category}`}
									</Body>
									<Body tone="muted" size={14}>
										{`Priority ${rule.priority}`}
									</Body>
								</View>
								{canEditRule ? (
									<Pressable
										accessibilityRole="button"
										accessibilityLabel={`Edit rule ${rule.pattern}`}
										hitSlop={10}
										onPress={() => startEdit(rule)}
										style={{ padding: 8 }}
									>
										<Pencil size={20} color={t.ink} />
									</Pressable>
								) : null}
								{canDelete ? (
									<Pressable
										accessibilityRole="button"
										accessibilityLabel={`Delete rule ${rule.pattern}`}
										hitSlop={10}
										disabled={remove.isPending}
										onPress={() => confirmDelete(rule)}
										style={{ padding: 8, opacity: remove.isPending ? 0.5 : 1 }}
									>
										<Trash2 size={20} color={t.negative} />
									</Pressable>
								) : null}
							</View>
						))}
					</View>
				)}
			</Card>

			{editing ? (
				<Card>
					<Heading>{editing === "new" ? "Add a rule" : "Edit rule"}</Heading>
					<Field
						label="Description contains"
						value={pattern}
						onChangeText={setPattern}
						placeholder="coffee"
						maxLength={200}
						autoCapitalize="none"
						autoCorrect={false}
					/>
					<Field
						label="Category"
						value={category}
						onChangeText={setCategory}
						placeholder="Food & drink"
						maxLength={100}
					/>
					<Field
						label="Priority"
						value={priority}
						onChangeText={setPriority}
						keyboardType="numbers-and-punctuation"
						maxLength={9}
					/>
					{editing === "new" ? (
						<Pressable
							onPress={() => setApplyToExisting(!applyToExisting)}
							style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
						>
							<Checkbox
								checked={applyToExisting}
								label="Also update existing expenses that match"
								onChange={setApplyToExisting}
							/>
							<Body size={15} style={{ flex: 1 }}>
								Also update existing expenses that match
							</Body>
						</Pressable>
					) : null}
					<GlassButton
						prominent
						label={
							save.isPending
								? "Saving…"
								: editing === "new"
									? "Add rule"
									: "Save rule"
						}
						busy={save.isPending}
						disabled={!valid}
						onPress={() => save.mutate()}
					/>
					<GlassButton
						label="Cancel"
						disabled={save.isPending}
						onPress={close}
					/>
				</Card>
			) : (
				<>
					{canAdd ? (
						<GlassButton
							prominent
							label="Add a rule"
							onPress={() => {
								setMessage("");
								setError("");
								setEditing("new");
							}}
						/>
					) : null}
					{!archived && !canAdd ? (
						<Body tone="muted" size={15}>
							Only an owner or admin can add or remove rules.
						</Body>
					) : null}
				</>
			)}

			{canReview ? (
				<Card>
					<Heading>Existing expenses</Heading>
					<Body tone="muted" size={15}>
						See which past expenses the rules would file differently, and pick
						the ones to update.
					</Body>
					<GlassButton
						label="Review expenses"
						onPress={() =>
							router.push({
								pathname: "/group/[groupId]/category-review",
								params: { groupId },
							})
						}
					/>
				</Card>
			) : null}

			{message ? <FormMessage tone="positive">{message}</FormMessage> : null}
			{error ? <FormMessage>{error}</FormMessage> : null}
		</Screen>
	);
}
