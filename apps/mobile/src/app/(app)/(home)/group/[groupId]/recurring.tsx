import { formatLongDate } from "@eventual/schemas/dates";
import { can, canEditRecurring } from "@eventual/schemas/permissions";
import { type EndpointOutput, isEventualApiError } from "@eventual/sdk";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ellipsis, Repeat } from "lucide-react-native";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	RefreshControl,
	ScrollView,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Amount } from "../../../../../components/amount";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
	Heading,
} from "../../../../../components/brand";
import {
	recurrences,
	storedExpense,
} from "../../../../../components/group/recurring-model";
import { useOptionPicker } from "../../../../../components/select-field";
import { idempotencyKey } from "../../../../../lib/mutations";
import { usePullRefresh } from "../../../../../lib/pull-refresh";
import {
	useGroupContext,
	useRefreshAfterWrite,
} from "../../../../../lib/queries";
import { useApi } from "../../../../../lib/session";
import { useTheme } from "../../../../../theme";

type Template = EndpointOutput<"recurring.list">[number];

export default function RecurringExpenses() {
	const { groupId } = useLocalSearchParams<{ groupId: string }>();
	const api = useApi();
	const router = useRouter();
	const t = useTheme();
	const context = useGroupContext(groupId);
	const refresh = useRefreshAfterWrite();
	const picker = useOptionPicker();
	const [message, setMessage] = useState("");
	const templates = useQuery({
		queryKey: ["group", groupId, "recurring"],
		queryFn: () => api.call("recurring.list", { groupId }),
		enabled: Boolean(context.data),
	});
	const write = useMutation({
		mutationFn: async ({
			template,
			action,
		}: {
			template: Template;
			action: "toggle" | "delete";
		}) => {
			const group = context.data?.group;
			if (
				!group ||
				group.archivedAt ||
				!canEditRecurring(
					group.myRole,
					template.createdByUserId === context.data?.user.id,
				)
			)
				throw new Error("This recurring expense is read-only.");
			return action === "delete"
				? api.call(
						"recurring.delete",
						{ templateId: template.id },
						{ idempotencyKey: idempotencyKey() },
					)
				: api.call(
						"recurring.update",
						{ templateId: template.id, active: !template.active },
						{ idempotencyKey: idempotencyKey() },
					);
		},
		onMutate: () => setMessage(""),
		onSuccess: async (_, { template, action }) => {
			setMessage(
				action === "delete"
					? "Recurring expense deleted"
					: template.active
						? "Recurring expense paused"
						: "Recurring expense resumed",
			);
			await refresh(groupId);
		},
	});
	function actions(template: Template) {
		const label =
			storedExpense(template.payload)?.description ?? "Recurring expense";
		picker.pick({
			title: label,
			options: [
				{ value: "toggle", label: template.active ? "Pause" : "Resume" },
				{ value: "delete", label: "Delete…", destructive: true },
			],
			onPick: (action) => {
				Alert.alert(
					action === "delete"
						? `Delete “${label}”?`
						: `${template.active ? "Pause" : "Resume"} “${label}”?`,
					action === "delete"
						? "Expenses it already added stay in the group. Nothing new is added from now on."
						: template.active
							? "No new expenses will be added while paused. Existing expenses stay."
							: "The server will resume this schedule. If its next run is overdue, past scheduled expenses may be added even if nobody opens the app.",
					[
						{ text: "Cancel", style: "cancel" },
						{
							text:
								action === "delete"
									? "Delete recurring expense"
									: template.active
										? "Pause"
										: "Resume",
							style: action === "delete" ? "destructive" : "default",
							onPress: () => {
								if (!write.isPending)
									write.mutate({
										template,
										action: action === "delete" ? "delete" : "toggle",
									});
							},
						},
					],
				);
			},
		});
	}
	const group = context.data?.group;
	const retry = () => {
		void context.refetch();
		void templates.refetch();
	};
	const pull = usePullRefresh(() =>
		Promise.all([context.refetch(), templates.refetch()]),
	);
	return (
		<SafeAreaView
			edges={["left", "right"]}
			style={{ flex: 1, backgroundColor: t.canvas }}
		>
			<ScrollView
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{
					paddingHorizontal: 20,
					paddingTop: 8,
					paddingBottom: 40,
					gap: 24,
				}}
				refreshControl={<RefreshControl {...pull} tintColor={t.mutedInk} />}
			>
				<Display>Recurring</Display>
				<Body tone="muted">
					Added by the server on the scheduled day, even if nobody opens the
					app. The exact time can vary.
				</Body>
				{!group ? (
					context.isError ? (
						<>
							<FormMessage>Couldn’t load this group.</FormMessage>
							<GlassButton label="Try again" onPress={retry} />
						</>
					) : (
						<ActivityIndicator color={t.mutedInk} />
					)
				) : (
					<>
						{group.archivedAt ? (
							<Body tone="muted">
								This group is archived. Recurring expenses are read-only and the
								server won’t add expenses.
							</Body>
						) : can(group.myRole, "expense", "create") ? (
							<GlassButton
								label="New recurring expense"
								onPress={() =>
									router.push({
										pathname: "/group/[groupId]/recurring-new",
										params: { groupId },
									})
								}
							/>
						) : null}
						{templates.isError || context.isError ? (
							<>
								<FormMessage>
									Couldn’t refresh. Any list below may be out of date.
								</FormMessage>
								<GlassButton label="Try again" onPress={retry} />
							</>
						) : null}
						<GlassButton
							label={templates.isFetching ? "Refreshing…" : "Refresh"}
							disabled={templates.isFetching}
							onPress={retry}
						/>
						{templates.isPending ? (
							<ActivityIndicator color={t.mutedInk} />
						) : templates.data?.length === 0 ? (
							<Card>
								<Heading>No recurring expenses</Heading>
								<Body tone="muted">
									Set up rent, subscriptions or another regular expense here.
								</Body>
							</Card>
						) : (
							[...(templates.data ?? [])]
								.sort(
									(a, b) =>
										Number(b.active) - Number(a.active) ||
										new Date(a.nextRunAt).getTime() -
											new Date(b.nextRunAt).getTime(),
								)
								.map((template) => {
									const expense = storedExpense(template.payload);
									const editable =
										!group.archivedAt &&
										canEditRecurring(
											group.myRole,
											template.createdByUserId === context.data?.user.id,
										);
									const payer =
										group.members.find(
											(member) => member.userId === expense?.paidByUserId,
										)?.name ?? "Former member";
									return (
										<Card key={template.id}>
											<View
												style={{
													flexDirection: "row",
													alignItems: "center",
													gap: 12,
												}}
											>
												<Repeat size={22} color={t.mutedInk} />
												<View style={{ flex: 1, gap: 4 }}>
													<Body weight="semibold">
														{expense?.description ?? "Recurring expense"}
													</Body>
													<Body tone="muted" size={14}>
														{template.active ? "Active" : "Paused"} ·{" "}
														{recurrences.find(
															(option) => option.value === template.recurrence,
														)?.label ?? template.recurrence}
													</Body>
												</View>
												{editable ? (
													<Pressable
														accessibilityRole="button"
														accessibilityLabel={`Actions for ${expense?.description ?? "recurring expense"}`}
														disabled={write.isPending}
														onPress={() => actions(template)}
														style={{
															minWidth: 44,
															minHeight: 44,
															alignItems: "center",
															justifyContent: "center",
														}}
													>
														{write.isPending &&
														write.variables?.template.id === template.id ? (
															<ActivityIndicator color={t.mutedInk} />
														) : (
															<Ellipsis size={22} color={t.ink} />
														)}
													</Pressable>
												) : null}
											</View>
											<Body tone="muted" size={14}>
												{template.active ? "Next run" : "Schedule resumes from"}
												: {formatLongDate(template.nextRunAt)}
											</Body>
											{expense ? (
												<>
													<Amount
														minor={expense.amountMinor}
														currency={expense.currency}
													/>
													<Body tone="muted" size={14}>
														Paid by {payer} · {expense.participants.length}{" "}
														{expense.participants.length === 1
															? "person"
															: "people"}{" "}
														·{" "}
														{expense.splitMethod === "even"
															? "by weight"
															: expense.splitMethod}
													</Body>
												</>
											) : (
												<Body tone="muted">Template details unavailable.</Body>
											)}
										</Card>
									);
								})
						)}
					</>
				)}
				{write.isError ? (
					<FormMessage>
						{isEventualApiError(write.error)
							? write.error.message
							: "Couldn’t update this recurring expense. Try again."}
					</FormMessage>
				) : null}
				{message ? (
					<Body accessibilityLiveRegion="polite" tone="positive">
						{message}
					</Body>
				) : null}
				{picker.sheet}
			</ScrollView>
		</SafeAreaView>
	);
}
