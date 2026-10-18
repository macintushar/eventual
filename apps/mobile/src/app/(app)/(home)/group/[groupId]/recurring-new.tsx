import { currencies } from "@eventual/schemas/currencies";
import { atNoon, formatLongDate } from "@eventual/schemas/dates";
import { formatMinor } from "@eventual/schemas/money";
import { can } from "@eventual/schemas/permissions";
import { type EndpointOutput, isEventualApiError } from "@eventual/sdk";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Repeat } from "lucide-react-native";
import { useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { AmountField } from "../../../../../components/amount-field";
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
import { DateField } from "../../../../../components/date-field";
import {
	buildRecurringInput,
	type Recurrence,
	recurrences,
	tomorrow,
} from "../../../../../components/group/recurring-model";
import { Segmented } from "../../../../../components/segmented";
import { SelectField } from "../../../../../components/select-field";
import { idempotencyKey } from "../../../../../lib/mutations";
import {
	useGroupContext,
	useRefreshAfterWrite,
} from "../../../../../lib/queries";
import { useApi } from "../../../../../lib/session";
import { useTheme } from "../../../../../theme";

export default function NewRecurringExpense() {
	const { groupId } = useLocalSearchParams<{ groupId: string }>();
	const context = useGroupContext(groupId);
	return (
		<Screen edges={["bottom", "left", "right"]}>
			{context.data ? (
				<RecurringForm groupId={groupId} context={context.data} />
			) : context.isError ? (
				<>
					<FormMessage>Couldn’t load this group.</FormMessage>
					<GlassButton
						label="Try again"
						onPress={() => void context.refetch()}
					/>
				</>
			) : (
				<ActivityIndicator />
			)}
		</Screen>
	);
}

function RecurringForm({
	groupId,
	context,
}: {
	groupId: string;
	context: EndpointOutput<"app.groupContext">;
}) {
	const api = useApi();
	const router = useRouter();
	const refresh = useRefreshAfterWrite();
	const t = useTheme();
	const members = context.group.members;
	const [description, setDescription] = useState("");
	const [amount, setAmount] = useState("");
	const [currency, setCurrency] = useState("INR");
	const [recurrence, setRecurrence] = useState<Recurrence>("monthly");
	const [date, setDate] = useState(tomorrow);
	const [payer, setPayer] = useState(
		members.find((member) => member.userId === context.user.id)?.userId ??
			members[0]?.userId ??
			"",
	);
	const [selected, setSelected] = useState(() =>
		members.map((member) => member.userId),
	);
	// Reuse only for the same submitted payload after a connection failure.
	const request = useRef<{ fingerprint: string; key: string } | null>(null);
	let ready: ReturnType<typeof buildRecurringInput> | undefined;
	let blocker = "";
	try {
		ready = buildRecurringInput(
			{
				groupId,
				description,
				amount,
				currency,
				recurrence,
				date,
				payer,
				selected,
			},
			members,
		);
	} catch (error) {
		blocker =
			error instanceof Error ? error.message : "Check the expense details.";
	}
	const readOnly =
		Boolean(context.group.archivedAt) ||
		!can(context.group.myRole, "expense", "create");
	const save = useMutation({
		mutationFn: () => {
			if (readOnly) throw new Error("This group is read-only.");
			// Revalidate at submit: midnight or membership refresh may change validity.
			const { input } = buildRecurringInput(
				{
					groupId,
					description,
					amount,
					currency,
					recurrence,
					date,
					payer,
					selected,
				},
				members,
			);
			const fingerprint = JSON.stringify(input);
			if (request.current?.fingerprint !== fingerprint)
				request.current = { fingerprint, key: idempotencyKey() };
			return api.call("recurring.create", input, {
				idempotencyKey: request.current.key,
			});
		},
		onSuccess: async () => {
			await refresh(groupId);
			router.dismissTo({
				pathname: "/group/[groupId]/recurring",
				params: { groupId },
			});
		},
	});
	const frozen = save.isPending;
	return (
		<>
			<View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
				<Repeat size={24} color={t.mutedInk} />
				<View style={{ flex: 1 }}>
					<Display size={30}>New recurring expense</Display>
				</View>
			</View>
			{readOnly ? (
				<FormMessage>
					{context.group.archivedAt
						? "This group is archived. Unarchive it before adding recurring expenses."
						: "You don’t have permission to add recurring expenses."}
				</FormMessage>
			) : null}
			<View
				pointerEvents={frozen || readOnly ? "none" : "auto"}
				style={{ gap: 24, opacity: readOnly ? 0.5 : 1 }}
			>
				<Field
					label="Description"
					value={description}
					onChangeText={setDescription}
					maxLength={200}
					placeholder="Rent, Netflix, cleaner…"
					editable={!frozen && !readOnly}
				/>
				<AmountField currency={currency} value={amount} onChange={setAmount} />
				<SelectField
					label="Currency"
					value={currency}
					options={currencies.map((row) => ({
						value: row.code,
						label: `${row.code} · ${row.name}`,
					}))}
					onChange={setCurrency}
				/>
				<View style={{ gap: 8 }}>
					<Body weight="medium">Repeats</Body>
					<Segmented
						value={recurrence}
						options={[...recurrences]}
						onChange={setRecurrence}
					/>
				</View>
				<DateField
					label="First on"
					value={date}
					future
					onChange={(next) => setDate(atNoon(next))}
				/>
				<SelectField
					label="Paid by"
					value={payer}
					options={members.map((member) => ({
						value: member.userId,
						label:
							member.name + (member.userId === context.user.id ? " (you)" : ""),
					}))}
					onChange={setPayer}
				/>
				<Card>
					<Heading>Split between</Heading>
					<Body tone="muted" size={14}>
						Shared by group weight. Weight 2 pays twice as much. Preview uses
						today’s weights; each run uses the group’s current weights.
					</Body>
					<GlassButton
						label={selected.length === members.length ? "Clear" : "Everyone"}
						disabled={frozen || readOnly}
						onPress={() =>
							setSelected(
								selected.length === members.length
									? []
									: members.map((member) => member.userId),
							)
						}
					/>
					{members.map((member) => {
						const share = ready?.shares.find(
							(row) => row.userId === member.userId,
						);
						return (
							<View
								key={member.userId}
								style={{
									flexDirection: "row",
									alignItems: "center",
									gap: 16,
									minHeight: 44,
								}}
							>
								<Checkbox
									label={`Split with ${member.name}`}
									checked={selected.includes(member.userId)}
									disabled={frozen || readOnly}
									onChange={(checked) =>
										setSelected((current) =>
											checked
												? [...current, member.userId]
												: current.filter((id) => id !== member.userId),
										)
									}
								/>
								<View style={{ flex: 1 }}>
									<Body>{member.name}</Body>
									<Body tone="muted" size={14}>
										Weight {member.weight}
									</Body>
								</View>
								{share ? (
									<Body size={14}>
										{formatMinor(share.amountMinor, currency)}
									</Body>
								) : null}
							</View>
						);
					})}
				</Card>
			</View>
			<Card>
				<Body accessibilityLiveRegion="polite">
					{ready
						? formatMinor(ready.input.payload.amountMinor, currency)
						: "This expense"}{" "}
					will be added{" "}
					{recurrences.find((option) => option.value === recurrence)?.every}{" "}
					from {formatLongDate(date)}, paid by{" "}
					{members.find((member) => member.userId === payer)?.name ??
						"a group member"}{" "}
					and split by weight between the selected people.
				</Body>
				<Body tone="muted" size={14}>
					It’s added by the server on that day, even if nobody opens the app.
					The exact time can vary. To change a template, delete it and create
					another.
				</Body>
			</Card>
			{blocker ? (
				<Body tone="muted" size={14}>
					{blocker}
				</Body>
			) : null}
			{save.isError ? (
				<FormMessage>
					{isEventualApiError(save.error)
						? save.error.message
						: "Couldn’t add this recurring expense. Your details are still here; try again."}
				</FormMessage>
			) : null}
			<GlassButton
				label={save.isPending ? "Adding…" : "Add recurring expense"}
				busy={save.isPending}
				disabled={Boolean(blocker) || readOnly || frozen}
				onPress={() => save.mutate()}
			/>
			<GlassButton
				label="Cancel"
				disabled={frozen}
				onPress={() => router.back()}
			/>
		</>
	);
}
