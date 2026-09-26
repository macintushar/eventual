import { Users } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Amount } from "#/components/amount";
import { CurrencySelect } from "#/components/currency-select";
import { EmptyState } from "#/components/empty-state";
import { MemberAvatar } from "#/components/member-avatar";
import { type Option, OptionCombobox } from "#/components/option-combobox";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { DatePicker } from "#/components/ui/date-picker";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "#/components/ui/input-group";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "#/components/ui/item";
import { Separator } from "#/components/ui/separator";
import { StepDialog } from "#/components/ui/step-dialog";
import { type Step, useStepper } from "#/components/ui/stepper";
import { Textarea } from "#/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { useAppMutation } from "#/lib/app-mutation";
import { currencyDecimals, currencySymbol } from "#/lib/currencies";
import { atNoon, formatLongDate } from "#/lib/dates";
import { formatMinor, fromMinor, parseMinor } from "#/lib/money";
import { cn } from "#/lib/utils";
import { computeShares, type SplitMethod } from "#/server/domain/split";

export type ComposerMember = { userId: string; name: string };
export type ComposerGroup = {
	id: string;
	name: string;
	members: ComposerMember[];
};

export type ExpenseDraft = {
	id: string;
	description: string;
	notes: string | null;
	amountMinor: number;
	currency: string;
	paidByUserId: string;
	splitMethod: SplitMethod;
	date: Date;
	shares: { userId: string; splitInput: number | null }[];
};

const methodHelp: Record<SplitMethod, string> = {
	even: "Everyone selected pays the same, rounded to the currency's smallest unit.",
	exact: "Type each person's exact amount. They must add up to the total.",
	shares: "Give each person a weight — 2 shares pays twice as much as 1.",
	percent: "Percentages of the total. They must add up to 100%.",
};

const methodLabel: Record<SplitMethod, string> = {
	even: "Split evenly",
	exact: "Exact amounts",
	shares: "By shares",
	percent: "By percentage",
};

const GROUP_STEP: Step = {
	id: "group",
	title: "Group",
	description: "Which shared tab this belongs to.",
};

const LATER_STEPS: Step[] = [
	{
		id: "details",
		title: "Details",
		description: "What was paid, and by whom.",
	},
	{ id: "split", title: "Split", description: "Who owes what." },
	{
		id: "review",
		title: "Review",
		description: "One last look before it lands.",
	},
];

/** Seeds sensible defaults so switching method never leaves stale numbers behind. */
function defaultInputs(method: SplitMethod, userIds: string[]) {
	if (method === "shares")
		return Object.fromEntries(userIds.map((userId) => [userId, "1"]));
	if (method === "percent" && userIds.length > 0) {
		// Distribute 100% in basis points so the seeded values always total 100.
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

function splitInput(
	method: SplitMethod,
	raw: string,
	currency: string,
): number | null {
	if (method === "even") return null;
	if (method === "exact") return parseMinor(raw || "0", currency);
	if (method === "percent") {
		const value = Number(raw);
		return Number.isFinite(value) ? Math.round(value * 100) : null;
	}
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

/** You paid for it far more often than anyone else did, so you are the default. */
function defaultPayer(members: ComposerMember[], currentUserId: string) {
	return members.some((member) => member.userId === currentUserId)
		? currentUserId
		: (members[0]?.userId ?? "");
}

/**
 * Add or edit an expense, as a stepped dialog. It opens from the dock on any
 * signed-in page, so the group is a step of the form rather than something the
 * route is assumed to have settled — preselected when there is a group in
 * context, and otherwise the first one you are in.
 *
 * Editing skips that step: an expense cannot change group, because its shares
 * and settlements are already bound to the one it is in.
 */
export function ExpenseComposer({
	open,
	onOpenChange,
	groups,
	currentUserId,
	defaultGroupId,
	initial,
	onSaved,
	onCreateGroup,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	groups: ComposerGroup[];
	currentUserId: string;
	defaultGroupId?: string;
	initial?: ExpenseDraft;
	onSaved: (groupId: string) => void | Promise<void>;
	/** Offered when there is no group yet to put an expense in. */
	onCreateGroup?: () => void;
}) {
	const fieldId = useId();
	const steps = useMemo(
		() => (initial ? LATER_STEPS : [GROUP_STEP, ...LATER_STEPS]),
		[initial],
	);
	const stepper = useStepper(
		steps,
		initial || defaultGroupId ? "details" : "group",
	);

	const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? "");
	const group = groups.find((row) => row.id === groupId);
	const members = useMemo(() => group?.members ?? [], [group]);

	const [description, setDescription] = useState(initial?.description ?? "");
	const [notes, setNotes] = useState(initial?.notes ?? "");
	const [currency, setCurrency] = useState(initial?.currency ?? "INR");
	const [amount, setAmount] = useState(
		initial ? fromMinor(initial.amountMinor, initial.currency) : "",
	);
	const [payer, setPayer] = useState(
		initial?.paidByUserId ?? defaultPayer(members, currentUserId),
	);
	const [method, setMethod] = useState<SplitMethod>(
		initial?.splitMethod ?? "even",
	);
	const [date, setDate] = useState(() =>
		atNoon(initial?.date ? new Date(initial.date) : new Date()),
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
	const save = useAppMutation();

	/*
	 * Payer and participants are member ids, so they cannot outlive a change of
	 * group — they would name people who are not in the new one. Resetting here
	 * rather than in an effect means the first render showing the new group's
	 * members never shows the old group's selection alongside them.
	 */
	const [scopedTo, setScopedTo] = useState(groupId);
	if (scopedTo !== groupId) {
		setScopedTo(groupId);
		setPayer(defaultPayer(members, currentUserId));
		setSelected(new Set(members.map((member) => member.userId)));
		setInputs(
			defaultInputs(
				method,
				members.map((member) => member.userId),
			),
		);
	}

	const changeMethod = (next: SplitMethod) => {
		if (next === method) return;
		setMethod(next);
		if (next !== "even") setInputs(defaultInputs(next, [...selected].sort()));
	};

	let totalMinor = 0;
	let preview: ReturnType<typeof computeShares> = [];
	let invalid = "";
	const amountMinor = parseMinor(amount, currency);
	if (amountMinor === null) {
		invalid = `Enter a valid ${currency} amount with at most ${currencyDecimals(currency)} decimals`;
	} else {
		try {
			totalMinor = amountMinor;
			const participants: { userId: string; input: number | null }[] = [];
			for (const member of members) {
				if (!selected.has(member.userId)) continue;
				const input = splitInput(method, inputs[member.userId] ?? "", currency);
				if (method !== "even" && input === null) {
					invalid = `Enter a valid split value for ${currency}`;
					break;
				}
				participants.push({ userId: member.userId, input });
			}
			if (!invalid)
				preview = computeShares(totalMinor, method, participants, currency);
		} catch (error) {
			preview = [];
			invalid = error instanceof Error ? error.message : "Invalid split";
		}
	}

	// Nothing typed yet, so there is nothing to be wrong about.
	const pristine = amount.trim() === "";
	const nameOf = (userId: string) =>
		members.find((member) => member.userId === userId)?.name ?? "Someone";

	const memberOptions: Option[] = members.map((member) => ({
		value: member.userId,
		label:
			member.userId === currentUserId ? `${member.name} (you)` : member.name,
		media: (
			<MemberAvatar
				name={member.name}
				seed={member.userId}
				className="size-5 text-[9px]"
			/>
		),
	}));

	const groupOptions: Option[] = groups.map((row) => ({
		value: row.id,
		label: row.name,
		hint: `${row.members.length} ${row.members.length === 1 ? "member" : "members"}`,
	}));

	/** What is stopping this step from being left, if anything. */
	const blocker = (() => {
		if (stepper.id === "group") return groupId ? "" : "Choose a group.";
		if (stepper.id === "details") {
			if (!description.trim()) return "Add a description.";
			if (pristine) return "Enter an amount.";
			if (amountMinor === null || amountMinor <= 0)
				return `Enter a valid ${currency} amount.`;
			if (!payer) return "Choose who paid.";
			return "";
		}
		if (stepper.id === "split") {
			if (selected.size === 0) return "Pick at least one person.";
			return invalid;
		}
		return "";
	})();

	const submit = async () => {
		const base = {
			description,
			notes: notes || null,
			amountMinor: totalMinor,
			currency,
			paidByUserId: payer,
			splitMethod: method,
			date,
			participants: preview.map((share) => ({
				userId: share.userId,
				input: share.splitInput,
			})),
		};
		const saved = await save.run(
			initial
				? {
						action: "expense.update",
						input: { ...base, expenseId: initial.id },
					}
				: { action: "expense.create", input: { ...base, groupId } },
			initial ? "Expense updated" : "Expense added",
		);
		if (!saved) return;
		onOpenChange(false);
		await onSaved(groupId);
	};

	if (!initial && groups.length === 0)
		return (
			<StepDialog
				open={open}
				onOpenChange={onOpenChange}
				title="Add an expense"
				steps={steps}
				index={0}
				onNext={() => {
					onOpenChange(false);
					onCreateGroup?.();
				}}
				nextLabel={onCreateGroup ? "Start a group" : "Close"}
			>
				<EmptyState
					icon={Users}
					title="No groups yet"
					description="An expense lives in a group, so there has to be one of those first. Start with your flat, a trip, or the next dinner."
				/>
			</StepDialog>
		);

	return (
		<StepDialog
			open={open}
			onOpenChange={onOpenChange}
			title={initial ? "Edit expense" : "Add an expense"}
			description={
				stepper.step?.description ??
				"Splits use the currency's smallest unit, so shares always add up to the total exactly."
			}
			steps={steps}
			index={stepper.index}
			onSelectStep={stepper.goTo}
			onBack={stepper.back}
			onNext={() => (stepper.isLast ? submit() : stepper.next())}
			nextLabel={
				stepper.isLast
					? save.isPending
						? "Saving…"
						: initial
							? "Save changes"
							: "Add expense"
					: "Continue"
			}
			nextDisabled={Boolean(blocker)}
			// The split step says the same thing in its own status panel, a few
			// pixels above, so it would only be said twice.
			nextHint={stepper.id === "split" ? undefined : blocker}
			pending={save.isPending}
		>
			{stepper.id === "group" ? (
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={`${fieldId}-group`}>Group</FieldLabel>
						<OptionCombobox
							id={`${fieldId}-group`}
							options={groupOptions}
							value={groupId}
							onValueChange={setGroupId}
							placeholder="Choose a group"
							emptyLabel="No group matches."
						/>
						<FieldDescription>
							The expense, its shares and its balances all stay inside this
							group.
						</FieldDescription>
					</Field>

					{members.length ? (
						<Field>
							<FieldLabel>Splitting with</FieldLabel>
							<ItemGroup>
								{members.map((member) => (
									<Item key={member.userId} size="sm" className="flex-nowrap">
										<ItemMedia>
											<MemberAvatar
												name={member.name}
												seed={member.userId}
												className="size-8"
											/>
										</ItemMedia>
										<ItemContent className="min-w-0">
											<ItemTitle className="w-full min-w-0">
												<span className="truncate">
													{member.name}
													{member.userId === currentUserId ? (
														<span className="text-muted-foreground">
															{" "}
															(you)
														</span>
													) : null}
												</span>
											</ItemTitle>
										</ItemContent>
									</Item>
								))}
							</ItemGroup>
							<FieldDescription>
								You can leave anyone out on the split step.
							</FieldDescription>
						</Field>
					) : null}
				</FieldGroup>
			) : null}

			{stepper.id === "details" ? (
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={`${fieldId}-description`}>
							Description
						</FieldLabel>
						<Input
							id={`${fieldId}-description`}
							value={description}
							placeholder="Beach shack dinner"
							onChange={(event) => setDescription(event.target.value)}
							maxLength={200}
						/>
					</Field>

					<Field data-invalid={!pristine && amountMinor === null}>
						<FieldLabel htmlFor={`${fieldId}-amount`}>Amount</FieldLabel>
						{/*
						 * The amount is the one number that has to be right, so on a phone
						 * it gets display type and a 56px target. `inputMode="decimal"`
						 * brings up the numeric keypad instead of the full keyboard.
						 */}
						<InputGroup className="h-14 sm:h-12">
							<InputGroupAddon>
								<InputGroupText className="text-2xl sm:text-lg">
									{currencySymbol(currency)}
								</InputGroupText>
							</InputGroupAddon>
							<InputGroupInput
								id={`${fieldId}-amount`}
								inputMode="decimal"
								aria-invalid={!pristine && amountMinor === null}
								placeholder={fromMinor(0, currency)}
								value={amount}
								onChange={(event) => setAmount(event.target.value)}
								className="tabular text-2xl font-semibold sm:text-lg"
							/>
						</InputGroup>
					</Field>

					<Field>
						<FieldLabel htmlFor={`${fieldId}-currency`}>Currency</FieldLabel>
						<CurrencySelect
							id={`${fieldId}-currency`}
							value={currency}
							onValueChange={setCurrency}
						/>
						<FieldDescription>
							Splits and repayments stay in this currency. Changing it does not
							convert the amount.
						</FieldDescription>
					</Field>

					<div className="grid gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor={`${fieldId}-date`}>Date</FieldLabel>
							<DatePicker
								id={`${fieldId}-date`}
								value={date}
								onValueChange={setDate}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={`${fieldId}-payer`}>Paid by</FieldLabel>
							<OptionCombobox
								id={`${fieldId}-payer`}
								options={memberOptions}
								value={payer}
								onValueChange={setPayer}
								placeholder="Choose who paid"
								emptyLabel="Nobody by that name."
							/>
						</Field>
					</div>

					<Field>
						<FieldLabel htmlFor={`${fieldId}-notes`}>Notes</FieldLabel>
						<Textarea
							id={`${fieldId}-notes`}
							rows={3}
							value={notes}
							placeholder="Anything worth remembering later."
							onChange={(event) => setNotes(event.target.value)}
							className="field-sizing-fixed"
						/>
						<FieldDescription>Optional.</FieldDescription>
					</Field>
				</FieldGroup>
			) : null}

			{stepper.id === "split" ? (
				<div className="flex flex-col gap-4">
					<ToggleGroup
						type="single"
						variant="outline"
						spacing={2}
						rovingFocus={false}
						value={method}
						onValueChange={(value) => {
							if (value && value !== method) changeMethod(value as SplitMethod);
						}}
						className="grid w-full grid-cols-2 sm:grid-cols-4"
						aria-label="Split method"
					>
						<ToggleGroupItem value="even">Even</ToggleGroupItem>
						<ToggleGroupItem value="exact">Exact</ToggleGroupItem>
						<ToggleGroupItem value="shares">Shares</ToggleGroupItem>
						<ToggleGroupItem value="percent">Percent</ToggleGroupItem>
					</ToggleGroup>
					<p className="text-sm text-muted-foreground">{methodHelp[method]}</p>

					<FieldSet>
						<FieldLegend className="sr-only">Participants</FieldLegend>
						<ItemGroup>
							{members.map((member) => {
								const share = preview.find(
									(row) => row.userId === member.userId,
								);
								const isOn = selected.has(member.userId);
								const boxId = `${fieldId}-in-${member.userId}`;
								return (
									<Item key={member.userId} size="sm" className="flex-nowrap">
										<ItemMedia>
											<Checkbox
												id={boxId}
												checked={isOn}
												onCheckedChange={(checked) =>
													setSelected((old) => {
														const next = new Set(old);
														if (checked) next.add(member.userId);
														else next.delete(member.userId);
														return next;
													})
												}
											/>
										</ItemMedia>
										<ItemMedia className="hidden sm:flex">
											<MemberAvatar
												name={member.name}
												seed={member.userId}
												className="size-8"
											/>
										</ItemMedia>
										<ItemContent className="min-w-0">
											<ItemTitle className="w-full min-w-0">
												<FieldLabel
													htmlFor={boxId}
													className={cn(
														"cursor-pointer truncate font-medium",
														!isOn && "text-muted-foreground line-through",
													)}
												>
													{member.name}
												</FieldLabel>
											</ItemTitle>
										</ItemContent>
										{method !== "even" ? (
											<ItemActions key="input">
												<InputGroup className="w-[5.25rem] sm:w-24">
													{method === "exact" ? (
														<InputGroupAddon>
															<InputGroupText>
																{currencySymbol(currency)}
															</InputGroupText>
														</InputGroupAddon>
													) : null}
													<InputGroupInput
														aria-label={`${
															method === "exact"
																? "Amount"
																: method === "percent"
																	? "Percent"
																	: "Shares"
														} for ${member.name}`}
														inputMode="decimal"
														className="tabular h-9"
														value={inputs[member.userId] ?? ""}
														disabled={!isOn}
														onChange={(event) =>
															setInputs((old) => ({
																...old,
																[member.userId]: event.target.value,
															}))
														}
													/>
													{method === "percent" ? (
														<InputGroupAddon align="inline-end">
															<InputGroupText>%</InputGroupText>
														</InputGroupAddon>
													) : null}
												</InputGroup>
											</ItemActions>
										) : null}
										<ItemActions key="amount">
											<span className="w-[4.5rem] text-right font-semibold sm:w-24">
												{share ? (
													<Amount
														minor={share.amountMinor}
														currency={currency}
													/>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</span>
										</ItemActions>
									</Item>
								);
							})}
						</ItemGroup>
					</FieldSet>

					{/*
					 * An untouched form isn't a wrong one. Until an amount is typed the
					 * panel states what it's waiting for; only a real mistake goes red.
					 */}
					<Alert
						role="status"
						className={cn(
							pristine
								? "border-border bg-muted/60 text-muted-foreground"
								: invalid
									? "border-destructive/40 bg-destructive/10 text-destructive"
									: "border-positive/30 bg-positive/10 text-positive [&>svg]:text-positive",
						)}
					>
						<AlertTitle className="line-clamp-none text-pretty">
							{pristine
								? "Enter an amount to see the split"
								: invalid ||
									`Assigned exactly ${formatMinor(totalMinor, currency)}`}
						</AlertTitle>
						<AlertDescription>
							{selected.size} {selected.size === 1 ? "person" : "people"}
						</AlertDescription>
					</Alert>
				</div>
			) : null}

			{stepper.id === "review" ? (
				<div className="flex flex-col gap-4">
					<div>
						<p className="island-kicker">{methodLabel[method]}</p>
						<p className="display-title text-3xl font-bold">
							{description || "Untitled"}
						</p>
						<p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
							<span className="text-xl font-bold text-foreground">
								<Amount minor={totalMinor} currency={currency} />
							</span>
							<span>· paid by {nameOf(payer)}</span>
							<span>· {formatLongDate(date)}</span>
							{group ? <span>· {group.name}</span> : null}
						</p>
					</div>

					<Separator />

					<ItemGroup>
						{preview.map((share) => (
							<Item key={share.userId} size="sm" className="flex-nowrap">
								<ItemMedia>
									<MemberAvatar
										name={nameOf(share.userId)}
										seed={share.userId}
										className="size-8"
									/>
								</ItemMedia>
								<ItemContent className="min-w-0">
									<ItemTitle className="w-full min-w-0">
										<span className="truncate">{nameOf(share.userId)}</span>
									</ItemTitle>
								</ItemContent>
								<ItemActions>
									<span className="font-semibold">
										<Amount minor={share.amountMinor} currency={currency} />
									</span>
								</ItemActions>
							</Item>
						))}
					</ItemGroup>

					{notes.trim() ? (
						<>
							<Separator />
							<p className="text-sm text-muted-foreground">{notes}</p>
						</>
					) : null}

					<Button
						type="button"
						variant="outline"
						className="press w-fit"
						onClick={() => stepper.goTo(steps.length - 2)}
					>
						Change the split
					</Button>
				</div>
			) : null}
		</StepDialog>
	);
}
