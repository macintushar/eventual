import { formatShortDate } from "@eventual/schemas/dates";
import { formatMinor } from "@eventual/schemas/money";
import { isEventualApiError } from "@eventual/sdk";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
	Heading,
	Screen,
} from "../../../../../components/brand";
import { Checkbox } from "../../../../../components/checkbox";
import { idempotencyKey } from "../../../../../lib/mutations";
import { useRefreshAfterWrite } from "../../../../../lib/queries";
import { useApi } from "../../../../../lib/session";
import { useTheme } from "../../../../../theme";

type Change = {
	expenseId: string;
	currentCategory: string | null;
};

/**
 * Filling in a missing category is safe to suggest; replacing one someone
 * picked is not, so those start unticked (as on the web).
 */
function defaultSelection(changes: readonly Change[]) {
	return new Set(
		changes
			.filter(
				(change) =>
					!change.currentCategory || change.currentCategory === "Other",
			)
			.map((change) => change.expenseId),
	);
}

export default function CategoryReview() {
	const api = useApi();
	const t = useTheme();
	const router = useRouter();
	const refresh = useRefreshAfterWrite();
	const { groupId } = useLocalSearchParams<{ groupId: string }>();
	const preview = useQuery({
		queryKey: ["group", groupId, "category-backfill"],
		queryFn: () => api.call("category.backfillPreview", { groupId }),
		// A review is a snapshot; don't reshuffle the list under someone's taps.
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 0,
	});
	const [selected, setSelected] = useState<Set<string> | null>(null);
	const [error, setError] = useState("");
	const [done, setDone] = useState<number | null>(null);

	const changes = preview.data?.changes ?? [];
	const chosen = selected ?? defaultSelection(changes);
	const picked = changes.filter((change) => chosen.has(change.expenseId));
	const allPicked = changes.length > 0 && picked.length === changes.length;

	const apply = useMutation({
		mutationFn: () =>
			api.call(
				"category.apply",
				{
					groupId,
					changes: picked.map((change) => ({
						expenseId: change.expenseId,
						category: change.category,
					})),
				},
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => setError(""),
		onSuccess: async (result) => {
			setDone(result.updated);
			await refresh(groupId);
		},
		onError: (cause) =>
			setError(
				isEventualApiError(cause)
					? cause.message
					: "Couldn’t update the expenses.",
			),
	});

	function toggle(expenseId: string) {
		const next = new Set(chosen);
		if (next.has(expenseId)) next.delete(expenseId);
		else next.add(expenseId);
		setSelected(next);
	}

	return (
		<Screen edges={["left", "right"]}>
			<Display size={32}>Update categories</Display>

			{done !== null ? (
				<Card>
					<Heading>Done</Heading>
					<Body>
						{done} {done === 1 ? "expense" : "expenses"} updated.
					</Body>
					<GlassButton prominent label="Back" onPress={() => router.back()} />
				</Card>
			) : preview.isPending ? (
				<ActivityIndicator style={{ marginTop: 40 }} />
			) : preview.isError ? (
				<Card>
					<Heading>Couldn’t load suggestions</Heading>
					<GlassButton
						label="Try again"
						onPress={() => void preview.refetch()}
					/>
				</Card>
			) : changes.length === 0 ? (
				<Body tone="muted">
					Every expense already has the category the rules would give it.
				</Body>
			) : (
				<>
					<Body tone="muted" size={15}>
						Expenses your rules and the built-in keywords would categorize
						differently. Ones that already have a category start unticked.
					</Body>
					<Card>
						<Pressable
							onPress={() =>
								setSelected(
									allPicked
										? new Set()
										: new Set(changes.map((change) => change.expenseId)),
								)
							}
							style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
						>
							<Checkbox
								checked={allPicked}
								label="Select all"
								onChange={(on) =>
									setSelected(
										on
											? new Set(changes.map((change) => change.expenseId))
											: new Set(),
									)
								}
							/>
							<Body weight="medium" style={{ flex: 1 }}>
								Select all
							</Body>
							<Body tone="muted" size={14}>
								{picked.length} of {changes.length}
							</Body>
						</Pressable>
						<View style={{ height: 1, backgroundColor: t.border }} />
						{changes.map((change) => (
							<Pressable
								key={change.expenseId}
								accessibilityRole="checkbox"
								accessibilityState={{ checked: chosen.has(change.expenseId) }}
								onPress={() => toggle(change.expenseId)}
								style={{
									flexDirection: "row",
									alignItems: "flex-start",
									gap: 12,
								}}
							>
								<Checkbox
									checked={chosen.has(change.expenseId)}
									label={change.description}
									onChange={() => toggle(change.expenseId)}
								/>
								<View style={{ flex: 1, gap: 2 }}>
									<Body weight="medium" numberOfLines={1}>
										{change.description}
									</Body>
									<Body tone="muted" size={14}>
										{formatShortDate(change.date)}
										{" · "}
										{formatMinor(change.amountMinor, change.currency)}
									</Body>
									<Body size={14}>
										{change.currentCategory ?? "No category"}
										{" → "}
										{change.category}
									</Body>
									{change.pattern ? (
										<Body tone="muted" size={13}>
											{`Matches “${change.pattern}”`}
										</Body>
									) : null}
								</View>
							</Pressable>
						))}
					</Card>
					<GlassButton
						prominent
						label={
							apply.isPending
								? "Updating…"
								: `Update ${picked.length || ""} ${picked.length === 1 ? "expense" : "expenses"}`
						}
						busy={apply.isPending}
						disabled={picked.length === 0}
						onPress={() => apply.mutate()}
					/>
				</>
			)}

			{error ? <FormMessage>{error}</FormMessage> : null}
		</Screen>
	);
}
