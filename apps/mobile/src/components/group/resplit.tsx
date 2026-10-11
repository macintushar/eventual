import { fromMinor } from "@eventual/schemas/money";
import type { EndpointOutput } from "@eventual/sdk";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, View } from "react-native";
import { useGroupContext, useRefreshAfterWrite } from "../../lib/queries";
import { useApi } from "../../lib/session";
import { useTheme } from "../../theme";
import {
	Body,
	Card,
	Field,
	FormMessage,
	GlassButton,
	Heading,
	Screen,
} from "../brand";
import {
	assertReviewUnchanged,
	canResplit,
	RESPLIT_LIMIT,
	type ResplitDraft,
	type ResplitExpense,
	type ResplitReview,
	resplitMethods,
	resplitResultComplete,
	reviewResplit,
} from "./resplit-model";

const methodLabels = {
	even: "Even · group weights",
	shares: "Shares",
	percent: "Percent",
};

export function ResplitScreen({ groupId }: { groupId: string }) {
	const api = useApi();
	const router = useRouter();
	const context = useGroupContext(groupId);
	const refresh = useRefreshAfterWrite();
	const expenses = useQuery({
		queryKey: ["group", groupId, "resplit-picker"],
		queryFn: () =>
			api.call("expense.page", {
				groupId,
				limit: RESPLIT_LIMIT,
				sortBy: "date",
				sortDirection: "desc",
			}),
	});
	const [selected, setSelected] = useState<ResplitExpense[]>([]);
	const [draft, setDraft] = useState<ResplitDraft>({
		method: "even",
		memberIds: [],
		values: {},
	});
	const [review, setReview] = useState<ResplitReview | null>(null);
	const [confirm, setConfirm] = useState(false);
	const [result, setResult] =
		useState<EndpointOutput<"expense.resplit"> | null>(null);
	const [unknown, setUnknown] = useState(false);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const inFlight = useRef(false);
	const active = useRef(true);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	useEffect(() => {
		if (!busy) return;
		const subscription = BackHandler.addEventListener(
			"hardwareBackPress",
			() => true,
		);
		return () => subscription.remove();
	}, [busy]);
	const group = context.data?.group;
	const allowed = group && canResplit(group);
	const finished = result !== null || unknown;

	async function preview() {
		if (inFlight.current) return;
		inFlight.current = true;
		setBusy(true);
		setError("");
		try {
			const next = await reviewResplit(api, groupId, selected, draft);
			if (active.current) {
				setReview(next);
				setConfirm(false);
			}
		} catch (e) {
			setError(
				e instanceof Error
					? e.message
					: "Couldn’t preview. Nothing was changed.",
			);
		} finally {
			inFlight.current = false;
			setBusy(false);
		}
	}

	async function apply() {
		if (inFlight.current || !review || !confirm || finished) return;
		inFlight.current = true;
		setBusy(true);
		setError("");
		let submitted = false;
		try {
			// Direct SDK reads are online-only and never trust a stale query cache.
			const latest = await reviewResplit(api, groupId, selected, draft);
			assertReviewUnchanged(review, latest);
			if (!active.current) return;
			submitted = true;
			const response = await api.call("expense.resplit", review.input);
			setResult(response);
			if (!resplitResultComplete(review.input.expenseIds, response))
				setError(
					"The server returned an incomplete result. Check every selected expense before trying again.",
				);
		} catch (e) {
			if (submitted) {
				// The server processes expenses independently. A lost response or 5xx
				// can follow committed writes. Never blindly retry or claim no changes.
				setUnknown(true);
				setError(
					`${e instanceof Error ? e.message : "Couldn’t finish the request."} Some expenses may have changed. Check the group before starting a new re-split.`,
				);
			} else {
				setReview(null);
				setConfirm(false);
				setError(
					`${e instanceof Error ? e.message : "Couldn’t validate the selection."} Nothing was submitted. Reload or preview again.`,
				);
			}
		} finally {
			if (submitted) {
				try {
					await refresh(groupId);
				} catch {
					setError((current) =>
						`${current} Couldn’t refresh. Reload the group to see current balances.`.trim(),
					);
				}
			}
			inFlight.current = false;
			setBusy(false);
		}
	}

	function resetReview() {
		setReview(null);
		setConfirm(false);
		setError("");
	}

	return (
		<>
			<Stack.Screen
				options={{ headerBackVisible: !busy, gestureEnabled: !busy }}
			/>
			<Screen edges={["left", "right", "bottom"]}>
				{finished ? (
					<Card>
						<Heading>
							{unknown
								? "Result not confirmed"
								: result?.skips.length
									? "Re-split finished with skips"
									: "Re-split result"}
						</Heading>
						{result ? (
							<>
								<Body>{`${result.successes.length} changed · ${result.skips.length} skipped`}</Body>
								{result.successes.map(({ expenseId }) => (
									<Body
										key={expenseId}
										size={14}
									>{`Changed: ${selected.find((row) => row.id === expenseId)?.description ?? expenseId}`}</Body>
								))}
								{result.skips.map(({ expenseId, code, reason }) => (
									<Body
										key={expenseId}
										tone="negative"
										size={14}
									>{`${selected.find((row) => row.id === expenseId)?.description ?? expenseId}: ${reason} (${code})`}</Body>
								))}
							</>
						) : null}
						{error ? <FormMessage>{error}</FormMessage> : null}
						<GlassButton
							label="Back to group"
							busy={busy}
							onPress={() => router.back()}
						/>
					</Card>
				) : !group ? (
					<Card>
						<Heading>
							{context.isError ? "Couldn’t load the group" : "Loading group…"}
						</Heading>
						{context.isError ? (
							<GlassButton
								label="Try again"
								onPress={() => void context.refetch()}
							/>
						) : null}
					</Card>
				) : !allowed ? (
					<Card>
						<Heading>Re-split unavailable</Heading>
						<Body>
							Only owners and admins can re-split expenses in an active group.
							Archived groups cannot be changed here.
						</Body>
					</Card>
				) : review ? (
					<>
						<Card>
							<Heading>
								{confirm ? "Confirm re-split" : "Review new shares"}
							</Heading>
							<Body>{`${selected.length} expenses · ${methodLabels[draft.method]}`}</Body>
							<Body tone="muted">
								Totals, currencies and payers stay the same. Existing shares are
								replaced. Paid or settled expenses are locked and will not be
								changed.
							</Body>
							<Body tone="muted">
								The server applies each expense separately. Any skips will be
								shown. Changes made by someone else during apply can affect the
								result.
							</Body>
							{error ? <FormMessage>{error}</FormMessage> : null}
							{confirm ? (
								<>
									<GlassButton
										prominent
										label={`Confirm and apply to ${selected.length} expenses`}
										busy={busy}
										onPress={() => void apply()}
									/>
									<GlassButton
										label="Back to preview"
										disabled={busy}
										onPress={() => setConfirm(false)}
									/>
								</>
							) : (
								<GlassButton
									prominent
									label="Continue to confirmation"
									onPress={() => setConfirm(true)}
								/>
							)}
							<GlassButton
								label="Change selection or split"
								disabled={busy}
								onPress={resetReview}
							/>
						</Card>
						{review.previews.map(({ expense, shares }) => (
							<Card key={expense.id}>
								<Heading>{expense.description}</Heading>
								<Body>{`${expense.currency} ${fromMinor(expense.amountMinor, expense.currency)}`}</Body>
								<Body tone="muted" size={14}>
									Current → new share
								</Body>
								{[
									...new Set([
										...expense.shares.map((row) => row.userId),
										...shares.map((row) => row.userId),
									]),
								].map((id) => {
									const old = expense.shares.find((row) => row.userId === id);
									const next = shares.find((row) => row.userId === id);
									const name =
										review.members.find((row) => row.userId === id)?.name ??
										old?.user.name ??
										id;
									return (
										<Body
											key={id}
											size={14}
										>{`${name}: ${fromMinor(old?.amountMinor ?? 0, expense.currency)} → ${fromMinor(next?.amountMinor ?? 0, expense.currency)}${!next ? " (removed)" : !old ? " (added)" : ""}`}</Body>
									);
								})}
							</Card>
						))}
					</>
				) : (
					<>
						<Card>
							<Heading>Choose expenses</Heading>
							<Body tone="muted">
								Choose from the latest 100 expenses, newest date first. Locked
								expenses are excluded. Older expenses are not included in this
								v1 picker.
							</Body>
							<Body>{`${selected.length} selected`}</Body>
							<GlassButton
								label="Reload expenses and members"
								disabled={busy}
								onPress={() => {
									setSelected([]);
									setError("");
									void expenses.refetch();
									void context.refetch();
								}}
							/>
							{expenses.isPending ? (
								<Body tone="muted">Loading expenses…</Body>
							) : null}
							{expenses.isError ? (
								<FormMessage>
									Couldn’t load current expenses. Reload before continuing.
								</FormMessage>
							) : null}
							{expenses.data?.items.length === 0 ? (
								<Body>No expenses yet.</Body>
							) : null}
							{expenses.data?.items.map((row) => (
								<Choice
									key={row.id}
									label={`${row.description} · ${row.currency} ${fromMinor(row.amountMinor, row.currency)}${row.locked ? " · Locked" : ""}`}
									checked={selected.some((item) => item.id === row.id)}
									disabled={busy || row.locked || expenses.isError}
									onPress={() =>
										setSelected((current) =>
											current.some((item) => item.id === row.id)
												? current.filter((item) => item.id !== row.id)
												: [...current, row],
										)
									}
								/>
							))}
						</Card>
						<Card>
							<Heading>New split</Heading>
							<Body tone="muted">
								Exact is excluded because selected expenses can have different
								totals. Even uses current group member weights. Use Shares for
								custom relative weights.
							</Body>
							{resplitMethods.map((method) => (
								<Choice
									key={method}
									label={methodLabels[method]}
									checked={draft.method === method}
									disabled={busy}
									onPress={() =>
										setDraft((current) => ({ ...current, method, values: {} }))
									}
								/>
							))}
							{group.members.map((member) => (
								<View key={member.userId} style={{ gap: 8 }}>
									<Choice
										label={`${member.name}${draft.method === "even" ? ` · weight ${member.weight}` : ""}`}
										checked={draft.memberIds.includes(member.userId)}
										disabled={busy}
										onPress={() =>
											setDraft((current) => ({
												...current,
												memberIds: current.memberIds.includes(member.userId)
													? current.memberIds.filter(
															(id) => id !== member.userId,
														)
													: [...current.memberIds, member.userId],
											}))
										}
									/>
									{draft.method !== "even" &&
									draft.memberIds.includes(member.userId) ? (
										<Field
											label={`${member.name} · ${draft.method === "shares" ? "whole-number shares" : "percent"}`}
											keyboardType={
												draft.method === "shares" ? "number-pad" : "decimal-pad"
											}
											editable={!busy}
											value={draft.values[member.userId] ?? ""}
											onChangeText={(value) =>
												setDraft((current) => ({
													...current,
													values: { ...current.values, [member.userId]: value },
												}))
											}
										/>
									) : null}
								</View>
							))}
							{draft.method === "percent" ? (
								<Body tone="muted">
									Percentages must total 100%, with up to two decimals.
								</Body>
							) : null}
							{error ? <FormMessage>{error}</FormMessage> : null}
							<GlassButton
								prominent
								label="Preview re-split"
								busy={busy}
								disabled={
									!selected.length ||
									!draft.memberIds.length ||
									expenses.isError ||
									context.isError ||
									expenses.isFetching ||
									context.isFetching
								}
								onPress={() => void preview()}
							/>
						</Card>
					</>
				)}
			</Screen>
		</>
	);
}

function Choice({
	label,
	checked,
	disabled,
	onPress,
}: {
	label: string;
	checked: boolean;
	disabled?: boolean;
	onPress: () => void;
}) {
	const t = useTheme();
	return (
		<Pressable
			accessibilityRole="checkbox"
			accessibilityLabel={label}
			accessibilityState={{ checked, disabled }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => ({
				minHeight: 48,
				paddingVertical: 10,
				paddingHorizontal: 12,
				borderRadius: 12,
				borderWidth: 1,
				borderColor: checked ? t.ink : t.border,
				backgroundColor: checked ? t.muted : t.paper,
				opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
			})}
		>
			<Body size={15}>{`${checked ? "✓ " : "○ "}${label}`}</Body>
		</Pressable>
	);
}
