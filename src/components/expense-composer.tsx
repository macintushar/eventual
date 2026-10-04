import { useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { Amount } from "#/components/amount";
import { EmptyState } from "#/components/empty-state";
import { MemberAvatar } from "#/components/member-avatar";
import { type Option, OptionCombobox } from "#/components/option-combobox";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "#/components/ui/select";
import { StepDialog } from "#/components/ui/step-dialog";
import { type Step, useStepper } from "#/components/ui/stepper";
import { Textarea } from "#/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { useAppMutation } from "#/lib/app-mutation";
import { currencies, currencyDecimals, currencySymbol } from "#/lib/currencies";
import { atNoon, formatLongDate } from "#/lib/dates";
import { formatMinor, fromMinor, parseMinor } from "#/lib/money";
import { cn } from "#/lib/utils";
import { computeShares, type SplitMethod } from "#/server/domain/split";

export type ComposerMember = {
	userId: string;
	name: string;
	image?: string | null;
	weight: number;
};
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

/*
 * The `even` method always honours each member's group weight. When everyone
 * in the group has the same weight that is simply an even split, so it is
 * named for what it does rather than for the mechanism behind it.
 */
const methodHelp: Record<SplitMethod, string> = {
	even: "Uses each selected member's group weight. Weight 2 pays twice as much as weight 1.",
	exact: "Type each person's exact amount. They must add up to the total.",
	shares: "Set a ratio for this expense — 2 pays twice as much as 1.",
	percent: "Percentages of the total. They must add up to 100%.",
};
const EVEN_HELP = "Everyone selected pays the same amount.";

const methodLabel: Record<SplitMethod, string> = {
	even: "By group weight",
	exact: "Exact amounts",
	shares: "By ratio",
	percent: "By percentage",
};
const EVEN_LABEL = "Split evenly";

/** Short names for the method switch, where four have to fit in a row. */
const methodToggle: Record<Exclude<SplitMethod, "even">, string> = {
	exact: "Exact",
	shares: "Ratio",
	percent: "Percent",
};

const currencyOptions = currencies.map(({ code, name }) => ({
	code,
	name,
	symbol: currencySymbol(code),
}));

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
	{
		id: "split",
		title: "Split",
		description: "Who owes what. The amounts shown are what gets saved.",
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
	const queryClient = useQueryClient();
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
	const [splitChanged, setSplitChanged] = useState(false);

	/*
	 * Payer and participants are member ids, so they cannot outlive a change of
	 * group — they would name people who are not in the new one. Resetting here
	 * rather than in an effect means the first render showing the new group's
	 * members never shows the old group's selection alongside them.
	 */
	const [scopedTo, setScopedTo] = useState(groupId);
	if (scopedTo !== groupId) {
		setScopedTo(groupId);
		setSplitChanged(false);
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
		setSplitChanged(false);
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
			const participants: {
				userId: string;
				input: number | null;
				weight: number;
			}[] = [];
			for (const member of members) {
				if (!selected.has(member.userId)) continue;
				const input = splitInput(method, inputs[member.userId] ?? "", currency);
				if (method !== "even" && input === null) {
					invalid = `Enter a valid split value for ${currency}`;
					break;
				}
				participants.push({
					userId: member.userId,
					input,
					weight: member.weight,
				});
			}
			if (!invalid)
				preview = computeShares(totalMinor, method, participants, currency);
		} catch (error) {
			preview = [];
			invalid = error instanceof Error ? error.message : "Invalid split";
		}
	}

	// Every member on the same weight means the weighted split is an even one.
	const weighted = members.some(
		(member) => member.weight !== members[0]?.weight,
	);
	const nameMethod = (value: SplitMethod) =>
		value === "even" && !weighted ? EVEN_LABEL : methodLabel[value];

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
				image={member.image}
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
			if (invalid) return invalid;
			if (totalMinor <= 0 || preview.length === 0)
				return `Enter a valid ${currency} amount.`;
			return "";
		}
		return "";
	})();

	/*
	 * Takes the split exactly as it is on screen. The server recomputes it and
	 * rejects the save if the two differ — a member's group weight changed
	 * while this was open — so nobody is charged an amount they never saw.
	 */
	const submit = async (shown: ReturnType<typeof computeShares>) => {
		const base = {
			description,
			notes: notes || null,
			amountMinor: totalMinor,
			currency,
			paidByUserId: payer,
			splitMethod: method,
			date,
			participants: shown.map((share) => ({
				userId: share.userId,
				input: share.splitInput,
			})),
			reviewedShares: shown.map((share) => ({
				userId: share.userId,
				amountMinor: share.amountMinor,
			})),
		};
		const outcome = await save.execute(
			initial
				? {
						action: "expense.update",
						input: { ...base, expenseId: initial.id },
					}
				: { action: "expense.create", input: { ...base, groupId } },
		);
		if (!outcome.ok) {
			const error = outcome.error as {
				status?: number;
				details?: { details?: { reason?: string } };
			};
			if (
				error?.status === 409 &&
				error.details?.details?.reason === "split_changed"
			) {
				// The composer may have been seeded from the group's own context,
				// so refresh that as well as the full list.
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: ["composer"] }),
					queryClient.invalidateQueries({
						queryKey: ["group", groupId, "page"],
					}),
					queryClient.invalidateQueries({
						queryKey: ["group", groupId, "context"],
					}),
				]);
				setSplitChanged(true);
				stepper.goTo(steps.length - 1);
			}
			return;
		}
		toast.success(initial ? "Expense updated" : "Expense added");
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
			onNext={() => {
				if (stepper.isLast) return submit(preview);
				stepper.next();
			}}
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
												image={member.image}
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
						<InputGroup className="h-14 has-[>[data-align=inline-start]]:[&>input]:pl-3 sm:h-12">
							{/*
							 * The currency rides in the amount box rather than in a field of
							 * its own: it is part of the number, and nearly everyone keeps
							 * the default.
							 */}
							<InputGroupAddon className="pl-1.5 has-[>button]:ml-0">
								<Select value={currency} onValueChange={setCurrency}>
									<SelectTrigger className="h-11 gap-1 rounded-[calc(var(--radius-md)-6px)] border-0 bg-muted px-2 text-foreground shadow-none sm:h-9 dark:bg-muted">
										<span className="sr-only">Currency: </span>
										<span className="tabular text-xl font-semibold sm:text-base">
											{currencySymbol(currency)}
										</span>
										<span className="text-xs font-medium text-muted-foreground">
											{currency}
										</span>
									</SelectTrigger>
									<SelectContent position="popper" align="start">
										{currencyOptions.map((option) => (
											<SelectItem key={option.code} value={option.code}>
												<span className="tabular w-8 font-semibold">
													{option.symbol}
												</span>
												<span>{option.code}</span>
												<span className="text-muted-foreground">
													{option.name}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
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
					{/* What is being split, so the split can be checked against it
					    without stepping back. */}
					<p className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
						<span className="font-medium text-foreground">
							{description || "Untitled"}
						</span>
						<span className="font-semibold text-foreground">
							<Amount minor={totalMinor} currency={currency} />
						</span>
						<span>· paid by {nameOf(payer)}</span>
						<span>· {formatLongDate(date)}</span>
						{group ? <span>· {group.name}</span> : null}
					</p>

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
						<ToggleGroupItem value="even">{nameMethod("even")}</ToggleGroupItem>
						<ToggleGroupItem value="exact">
							{methodToggle.exact}
						</ToggleGroupItem>
						<ToggleGroupItem value="shares">
							{methodToggle.shares}
						</ToggleGroupItem>
						<ToggleGroupItem value="percent">
							{methodToggle.percent}
						</ToggleGroupItem>
					</ToggleGroup>
					<p className="text-sm text-muted-foreground">
						{method === "even" && !weighted ? EVEN_HELP : methodHelp[method]}
					</p>
					{splitChanged ? (
						<Alert role="alert">
							<AlertTitle>Group weights changed</AlertTitle>
							<AlertDescription>
								The amounts below have been updated. Check them, then add the
								expense again.
							</AlertDescription>
						</Alert>
					) : null}

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
												image={member.image}
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
											{method === "even" ? (
												<p className="text-xs text-muted-foreground">
													Weight {member.weight}
												</p>
											) : null}
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
																	: "Ratio"
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
							{nameMethod(method)} · {selected.size}{" "}
							{selected.size === 1 ? "person" : "people"}
						</AlertDescription>
					</Alert>
				</div>
			) : null}
		</StepDialog>
	);
}
