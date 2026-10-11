import {
	currencies,
	currencyDecimals,
	currencySymbol,
} from "@eventual/schemas/currencies";
import { atNoon } from "@eventual/schemas/dates";
import { formatMinor, fromMinor, parseMinor } from "@eventual/schemas/money";
import { computeShares, type SplitMethod } from "@eventual/schemas/split";
import { type EndpointOutput, isEventualApiError } from "@eventual/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Amount } from "../../../../../../components/amount";
import { AmountField } from "../../../../../../components/amount-field";
import {
	Body,
	Display,
	Field,
	FormMessage,
	GlassButton,
} from "../../../../../../components/brand";
import { Checkbox } from "../../../../../../components/checkbox";
import { DateField } from "../../../../../../components/date-field";
import {
	SelectField,
	useOptionPicker,
} from "../../../../../../components/select-field";
import { idempotencyKey } from "../../../../../../lib/mutations";
import {
	useGroupContext,
	useRefreshAfterWrite,
} from "../../../../../../lib/queries";
import { useApi } from "../../../../../../lib/session";
import { fonts, shadow, useTheme } from "../../../../../../theme";

type Member = EndpointOutput<"app.groupContext">["group"]["members"][number];
type Expense = EndpointOutput<"expense.get">;

/* Same names as the web composer. */
const methodLabel: Record<SplitMethod, string> = {
	even: "By weight",
	exact: "Exact",
	shares: "Ratio",
	percent: "Percent",
};
const methodHelp: Record<SplitMethod, string> = {
	even: "Shared by group weight. Weight 2 pays twice as much.",
	exact: "Type each person’s amount. They must add up to the total.",
	shares: "A ratio for this expense: 2 pays twice as much as 1.",
	percent: "Percentages that add up to 100%.",
};

/** Seeds sensible values so switching method never leaves stale numbers. */
function defaultInputs(method: SplitMethod, userIds: string[]) {
	if (method === "shares")
		return Object.fromEntries(userIds.map((userId) => [userId, "1"]));
	if (method === "percent" && userIds.length > 0) {
		const base = Math.floor(10000 / userIds.length);
		const remainder = 10000 - base * userIds.length;
		return Object.fromEntries(
			userIds.map((userId, index) => [
				userId,
				String((base + (index < remainder ? 1 : 0)) / 100),
			]),
		);
	}
	return Object.fromEntries(userIds.map((userId) => [userId, ""]));
}

function splitInput(method: SplitMethod, raw: string, currency: string) {
	if (method === "even") return null;
	if (method === "exact") return parseMinor(raw || "0", currency);
	const value = Number(raw);
	if (!Number.isFinite(value)) return null;
	return method === "percent" ? Math.round(value * 100) : value;
}

export default function ComposeExpense() {
	const t = useTheme();
	const api = useApi();
	const { groupId, expenseId } = useLocalSearchParams<{
		groupId: string;
		expenseId?: string;
	}>();
	const context = useGroupContext(groupId);
	const existing = useQuery({
		queryKey: ["expense", expenseId],
		queryFn: () => api.call("expense.get", { expenseId: expenseId ?? "" }),
		enabled: Boolean(expenseId),
	});
	const ready = context.data && (!expenseId || existing.data);
	return (
		<SafeAreaView
			edges={["bottom"]}
			style={{ flex: 1, backgroundColor: t.canvas }}
		>
			{ready ? (
				<Composer
					groupId={groupId}
					members={context.data.group.members}
					me={context.data.user.id}
					initial={existing.data}
				/>
			) : context.isError || existing.isError ? (
				<View style={{ padding: 24, gap: 16 }}>
					<FormMessage>Couldn’t load this group.</FormMessage>
					<GlassButton
						label="Try again"
						onPress={() => {
							void context.refetch();
							if (expenseId) void existing.refetch();
						}}
					/>
				</View>
			) : (
				<ActivityIndicator color={t.mutedInk} style={{ marginTop: 48 }} />
			)}
		</SafeAreaView>
	);
}

function Composer({
	groupId,
	members,
	me,
	initial,
}: {
	groupId: string;
	members: Member[];
	me: string;
	initial?: Expense;
}) {
	const t = useTheme();
	const api = useApi();
	const router = useRouter();
	const queryClient = useQueryClient();
	const refresh = useRefreshAfterWrite();
	const [step, setStep] = useState<"details" | "split">("details");

	const [description, setDescription] = useState(initial?.description ?? "");
	const [notes, setNotes] = useState(initial?.notes ?? "");
	const [currency, setCurrency] = useState(initial?.currency ?? "INR");
	const [amount, setAmount] = useState(
		initial ? fromMinor(initial.amountMinor, initial.currency) : "",
	);
	const [payer, setPayer] = useState(
		initial?.paidByUserId ??
			(members.some((member) => member.userId === me)
				? me
				: (members[0]?.userId ?? "")),
	);
	const [date, setDate] = useState(() =>
		atNoon(initial ? new Date(initial.date) : new Date()),
	);
	const [method, setMethod] = useState<SplitMethod>(
		initial?.splitMethod ?? "even",
	);
	const [selected, setSelected] = useState(
		() =>
			new Set(
				initial?.shares.map((share) => share.userId) ??
					members.map((member) => member.userId),
			),
	);
	const [inputs, setInputs] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			initial?.shares.map((share) => [
				share.userId,
				initial.splitMethod === "exact"
					? fromMinor(share.splitInput ?? 0, initial.currency)
					: initial.splitMethod === "percent"
						? String((share.splitInput ?? 0) / 100)
						: String(share.splitInput ?? 1),
			]) ?? [],
		),
	);
	const [splitChanged, setSplitChanged] = useState(false);
	// One key per sheet: a retry after a dropped connection can't add twice.
	const key = useRef(idempotencyKey());

	const amountMinor = parseMinor(amount, currency);
	let preview: ReturnType<typeof computeShares> = [];
	let invalid = "";
	if (amountMinor === null || amountMinor <= 0)
		invalid = `Enter a valid ${currency} amount`;
	else
		try {
			const participants = [];
			for (const member of members) {
				if (!selected.has(member.userId)) continue;
				const input = splitInput(method, inputs[member.userId] ?? "", currency);
				if (method !== "even" && input === null) {
					invalid = "Enter a number for everyone selected";
					break;
				}
				participants.push({
					userId: member.userId,
					input,
					weight: member.weight,
				});
			}
			if (!invalid)
				preview = computeShares(amountMinor, method, participants, currency);
		} catch (error) {
			invalid = error instanceof Error ? error.message : "Invalid split";
		}

	const weighted = members.some(
		(member) => member.weight !== members[0]?.weight,
	);
	const nameMethod = (value: SplitMethod) =>
		value === "even" && !weighted ? "Evenly" : methodLabel[value];
	const nameOf = (userId: string) =>
		members.find((member) => member.userId === userId)?.name ?? "Someone";

	const detailsBlocker = !description.trim()
		? "Add a description."
		: !amount.trim()
			? "Enter an amount."
			: amountMinor === null || amountMinor <= 0
				? `Enter a valid ${currency} amount.`
				: !payer
					? "Choose who paid."
					: "";
	const splitBlocker =
		selected.size === 0 ? "Pick at least one person." : invalid;

	const save = useMutation({
		mutationFn: (shown: typeof preview) => {
			const base = {
				description: description.trim(),
				notes: notes.trim() || null,
				amountMinor: amountMinor ?? 0,
				currency,
				paidByUserId: payer,
				splitMethod: method,
				date,
				participants: shown.map((share) => ({
					userId: share.userId,
					input: share.splitInput,
				})),
				// The server recomputes and refuses if it differs from what was
				// shown here, so nobody is charged an amount they never saw.
				reviewedShares: shown.map((share) => ({
					userId: share.userId,
					amountMinor: share.amountMinor,
				})),
			};
			return initial
				? api.call(
						"expense.update",
						{ ...base, expenseId: initial.id },
						{ idempotencyKey: key.current },
					)
				: api.call(
						"expense.create",
						{ ...base, groupId },
						{ idempotencyKey: key.current },
					);
		},
		onSuccess: async (saved) => {
			queryClient.setQueryData(["expense", saved.id], saved);
			await refresh(groupId);
			router.back();
		},
		onError: async (error) => {
			if (
				isEventualApiError(error) &&
				error.status === 409 &&
				(error.details as { reason?: string } | undefined)?.reason ===
					"split_changed"
			) {
				// A member's weight changed while this was open: show the new split.
				key.current = idempotencyKey();
				await queryClient.invalidateQueries({
					queryKey: ["group", groupId, "context"],
				});
				setSplitChanged(true);
				setStep("split");
			}
		},
	});

	const picker = useOptionPicker();
	function chooseCurrency() {
		picker.pick({
			title: "Currency",
			current: currency,
			options: currencies.map(({ code, name }) => ({
				value: code,
				label: `${currencySymbol(code)}  ${code} · ${name}`,
			})),
			onPick: (code) => {
				if (code === currency) return;
				setCurrency(code);
				setAmount("");
				if (method === "exact")
					setInputs(defaultInputs("exact", [...selected]));
			},
		});
	}

	function changeMethod(next: SplitMethod) {
		if (next === method) return;
		setSplitChanged(false);
		setMethod(next);
		if (next !== "even") setInputs(defaultInputs(next, [...selected].sort()));
	}

	function toggle(userId: string, on: boolean) {
		setSplitChanged(false);
		setSelected((current) => {
			const next = new Set(current);
			if (on) next.add(userId);
			else next.delete(userId);
			if (method !== "even") setInputs(defaultInputs(method, [...next].sort()));
			return next;
		});
	}

	const title = initial ? "Edit expense" : "Add an expense";
	const index = step === "details" ? 0 : 1;

	return (
		<View style={{ flex: 1 }}>
			<ScrollView
				keyboardShouldPersistTaps="always"
				keyboardDismissMode="interactive"
				automaticallyAdjustKeyboardInsets
				contentContainerStyle={{ padding: 20, paddingTop: 28, gap: 20 }}
			>
				<View style={{ gap: 12 }}>
					<Display size={28}>{title}</Display>
					<View style={{ flexDirection: "row", gap: 6 }}>
						{[0, 1].map((segment) => (
							<View
								key={segment}
								style={{
									flex: 1,
									height: 4,
									borderRadius: 2,
									backgroundColor: segment <= index ? t.ink : t.border,
								}}
							/>
						))}
					</View>
					<Body tone="muted" size={14}>
						Step {index + 1} of 2 ·{" "}
						<Body size={14} weight="semibold">
							{step === "details" ? "Details" : "Split"}
						</Body>
					</Body>
				</View>

				{step === "details" ? (
					<>
						<Field
							label="Description"
							placeholder="Dinner, cab, groceries…"
							value={description}
							onChangeText={setDescription}
							maxLength={200}
							autoFocus={!initial}
							returnKeyType="next"
						/>
						<AmountField
							currency={currency}
							value={amount}
							onChange={setAmount}
							onCurrencyPress={chooseCurrency}
						/>
						<SelectField
							label="Paid by"
							value={payer}
							options={members.map((member) => ({
								value: member.userId,
								label:
									member.userId === me ? `${member.name} (you)` : member.name,
							}))}
							onChange={setPayer}
						/>
						<DateField
							label="Date"
							value={date}
							onChange={(next) => setDate(atNoon(next))}
						/>
						<Field
							label="Notes"
							placeholder="Optional"
							value={notes}
							onChangeText={setNotes}
							multiline
							maxLength={2000}
							style={{
								minHeight: 80,
								paddingTop: 14,
								textAlignVertical: "top",
							}}
						/>
					</>
				) : (
					<>
						<View style={{ gap: 2 }}>
							<View
								style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}
							>
								<Body
									weight="semibold"
									numberOfLines={1}
									style={{ flexShrink: 1 }}
								>
									{description.trim()}
								</Body>
								{amountMinor ? (
									<Amount minor={amountMinor} currency={currency} size={16} />
								) : null}
							</View>
							<Body tone="muted" size={14}>
								Paid by {payer === me ? "you" : nameOf(payer)}
							</Body>
						</View>

						<View style={{ gap: 8 }}>
							{(
								[
									["even", "exact"],
									["shares", "percent"],
								] as const
							).map((row) => (
								<View key={row[0]} style={{ flexDirection: "row", gap: 8 }}>
									{row.map((value) => {
										const active = value === method;
										return (
											<Pressable
												key={value}
												accessibilityRole="radio"
												accessibilityState={{ selected: active }}
												onPress={() => changeMethod(value)}
												style={[
													{
														flex: 1,
														minHeight: 44,
														borderRadius: 999,
														alignItems: "center",
														justifyContent: "center",
														borderWidth: 1,
														borderColor: active ? t.ink : t.input,
														backgroundColor: active ? t.raised : "transparent",
													},
													active ? shadow(t) : null,
												]}
											>
												<Body size={15} weight={active ? "semibold" : "medium"}>
													{nameMethod(value)}
												</Body>
											</Pressable>
										);
									})}
								</View>
							))}
							<Body tone="muted" size={14}>
								{method === "even" && !weighted
									? "Everyone selected pays the same."
									: methodHelp[method]}
							</Body>
						</View>

						<View style={{ gap: 4 }}>
							{members.map((member) => {
								const on = selected.has(member.userId);
								const share = preview.find(
									(row) => row.userId === member.userId,
								);
								return (
									<View
										key={member.userId}
										style={{
											flexDirection: "row",
											alignItems: "center",
											gap: 12,
											minHeight: 56,
										}}
									>
										<Checkbox
											checked={on}
											label={`Include ${member.name}`}
											onChange={(next) => toggle(member.userId, next)}
										/>
										<View style={{ flex: 1 }}>
											<Body
												weight="medium"
												numberOfLines={1}
												style={
													on
														? undefined
														: {
																textDecorationLine: "line-through",
																color: t.mutedInk,
															}
												}
											>
												{member.userId === me
													? `${member.name} (you)`
													: member.name}
											</Body>
											{method === "even" && weighted ? (
												<Body tone="muted" size={13}>
													Weight {member.weight}
												</Body>
											) : null}
										</View>
										{method !== "even" && on ? (
											<SplitInput
												method={method}
												currency={currency}
												name={member.name}
												value={inputs[member.userId] ?? ""}
												onChange={(text) => {
													setSplitChanged(false);
													setInputs((current) => ({
														...current,
														[member.userId]: text,
													}));
												}}
											/>
										) : null}
										<View style={{ minWidth: 84, alignItems: "flex-end" }}>
											{on && share ? (
												<Amount
													minor={share.amountMinor}
													currency={currency}
													size={15}
												/>
											) : (
												<Body tone="muted" size={15}>
													—
												</Body>
											)}
										</View>
									</View>
								);
							})}
						</View>

						<View
							accessibilityLiveRegion="polite"
							style={{
								padding: 16,
								borderRadius: 16,
								borderWidth: 1,
								borderColor: splitBlocker
									? `${t.negative}55`
									: `${t.positive}55`,
								backgroundColor: splitBlocker
									? `${t.negative}12`
									: `${t.positive}12`,
							}}
						>
							<Body
								weight="semibold"
								tone={splitBlocker ? "negative" : "positive"}
							>
								{splitBlocker ||
									`Assigned exactly ${formatMinor(amountMinor ?? 0, currency)}`}
							</Body>
							<Body tone="muted" size={14}>
								{nameMethod(method)} · {selected.size}{" "}
								{selected.size === 1 ? "person" : "people"}
							</Body>
						</View>
						{splitChanged ? (
							<FormMessage>
								Someone’s group weight changed while you were editing, so the
								split was recalculated. Check it and save again.
							</FormMessage>
						) : save.isError && !splitChanged ? (
							<FormMessage>
								{isEventualApiError(save.error)
									? save.error.message
									: "Couldn’t save. Check your connection and try again; it won’t be added twice."}
							</FormMessage>
						) : null}
					</>
				)}
			</ScrollView>

			<View
				style={{
					paddingHorizontal: 20,
					paddingTop: 12,
					paddingBottom: 8,
					gap: 8,
					borderTopWidth: 1,
					borderTopColor: t.border,
					backgroundColor: t.canvas,
				}}
			>
				{step === "details" ? (
					<>
						{detailsBlocker && description ? (
							<Body tone="muted" size={14} center>
								{detailsBlocker}
							</Body>
						) : null}
						<GlassButton
							prominent
							label="Continue"
							disabled={Boolean(detailsBlocker)}
							onPress={() => setStep("split")}
						/>
					</>
				) : (
					<View style={{ flexDirection: "row", gap: 10 }}>
						<View style={{ flex: 1 }}>
							<GlassButton label="Back" onPress={() => setStep("details")} />
						</View>
						<View style={{ flex: 2 }}>
							<GlassButton
								prominent
								label={
									save.isPending
										? "Saving…"
										: initial
											? "Save changes"
											: "Add expense"
								}
								busy={save.isPending}
								disabled={Boolean(splitBlocker)}
								onPress={() => save.mutate(preview)}
							/>
						</View>
					</View>
				)}
			</View>
			{picker.sheet}
		</View>
	);
}

function SplitInput({
	method,
	currency,
	name,
	value,
	onChange,
}: {
	method: Exclude<SplitMethod, "even">;
	currency: string;
	name: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const t = useTheme();
	const unit =
		method === "percent"
			? "%"
			: method === "exact"
				? currencySymbol(currency)
				: "×";
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				width: 92,
				height: 40,
				borderRadius: 12,
				borderWidth: 1,
				borderColor: t.input,
				backgroundColor: t.paper,
				paddingHorizontal: 10,
				gap: 4,
			}}
		>
			{method === "exact" ? (
				<Body tone="muted" size={14}>
					{unit}
				</Body>
			) : null}
			<TextInput
				accessibilityLabel={`${method === "exact" ? "Amount" : method === "percent" ? "Percent" : "Ratio"} for ${name}`}
				value={value}
				onChangeText={onChange}
				keyboardType={
					method === "shares" ||
					(method === "exact" && currencyDecimals(currency) === 0)
						? "number-pad"
						: "decimal-pad"
				}
				selectTextOnFocus
				selectionColor={t.ring}
				style={{
					flex: 1,
					fontFamily: fonts.semibold,
					fontSize: 16,
					color: t.ink,
					textAlign: "right",
					fontVariant: ["tabular-nums"],
				}}
			/>
			{method !== "exact" ? (
				<Body tone="muted" size={14}>
					{unit}
				</Body>
			) : null}
		</View>
	);
}
