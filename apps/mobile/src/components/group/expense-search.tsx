import { ArrowDownUp, Search, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { fonts, useTheme } from "../../theme";
import { useOptionPicker } from "../select-field";

export type ExpenseSortBy =
	| "date"
	| "amountMinor"
	| "description"
	| "payer"
	| "category";
export type SortDirection = "asc" | "desc";
export type ExpenseSort = {
	sortBy: ExpenseSortBy;
	sortDirection: SortDirection;
};

export const defaultExpenseSort: ExpenseSort = {
	sortBy: "date",
	sortDirection: "desc",
};

const sortOptions: { value: ExpenseSortBy; label: string }[] = [
	{ value: "date", label: "Date" },
	{ value: "amountMinor", label: "Amount" },
	{ value: "description", label: "Description" },
	{ value: "payer", label: "Paid by" },
	{ value: "category", label: "Category" },
];
/** Returns `value` once it has stopped changing for `delay` ms. */
export function useDebounced<T>(value: T, delay = 300): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);
	return debounced;
}

/** Search field plus a Sort button that opens the key, then the direction. */
export function ExpenseSearchBar({
	text,
	onChangeText,
	sort,
	onChangeSort,
}: {
	text: string;
	onChangeText: (text: string) => void;
	sort: ExpenseSort;
	onChangeSort: (sort: ExpenseSort) => void;
}) {
	const t = useTheme();
	const picker = useOptionPicker();
	const [focused, setFocused] = useState(false);
	const sortLabel = sortOptions.find(
		(option) => option.value === sort.sortBy,
	)?.label;
	const arrow = sort.sortDirection === "desc" ? "↓" : "↑";

	function pickSort() {
		picker.pick({
			title: "Sort by (pick again to reverse)",
			options: sortOptions,
			current: sort.sortBy,
			onPick: (value) => {
				const sortBy = value as ExpenseSortBy;
				// Same key reverses; a new key starts newest/largest or A to Z.
				onChangeSort({
					sortBy,
					sortDirection:
						sortBy === sort.sortBy
							? sort.sortDirection === "desc"
								? "asc"
								: "desc"
							: sortBy === "date" || sortBy === "amountMinor"
								? "desc"
								: "asc",
				});
			},
		});
	}

	return (
		<View style={{ gap: 10 }}>
			<View style={{ flexDirection: "row", gap: 10 }}>
				<View
					style={{
						flex: 1,
						minHeight: 48,
						flexDirection: "row",
						alignItems: "center",
						gap: 8,
						paddingLeft: focused ? 11 : 12,
						borderRadius: 14,
						borderWidth: focused ? 2 : 1,
						borderColor: focused ? t.ring : t.input,
						backgroundColor: t.paper,
					}}
				>
					<Search size={18} color={t.mutedInk} />
					<TextInput
						value={text}
						onChangeText={onChangeText}
						onFocus={() => setFocused(true)}
						onBlur={() => setFocused(false)}
						placeholder="Search expenses"
						placeholderTextColor={t.mutedInk}
						selectionColor={t.ring}
						accessibilityLabel="Search descriptions, notes, or categories"
						returnKeyType="search"
						autoCapitalize="none"
						autoCorrect={false}
						style={{
							flex: 1,
							paddingVertical: 10,
							color: t.ink,
							fontFamily: fonts.body,
							fontSize: 17,
						}}
					/>
					{text ? (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Clear search"
							hitSlop={8}
							onPress={() => onChangeText("")}
							style={{ padding: 10 }}
						>
							<X size={18} color={t.mutedInk} />
						</Pressable>
					) : null}
				</View>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`Sort: ${sortLabel}, ${sort.sortDirection === "desc" ? "descending" : "ascending"}`}
					onPress={pickSort}
					style={({ pressed }) => ({
						minHeight: 48,
						flexDirection: "row",
						alignItems: "center",
						gap: 6,
						paddingHorizontal: 12,
						borderRadius: 14,
						borderWidth: 1,
						borderColor: t.input,
						backgroundColor: pressed ? t.muted : t.paper,
					})}
				>
					<ArrowDownUp size={16} color={t.mutedInk} />
					<Text
						style={{ fontFamily: fonts.medium, fontSize: 15, color: t.ink }}
					>
						{sortLabel} {arrow}
					</Text>
				</Pressable>
			</View>
			{picker.sheet}
		</View>
	);
}
