import { Pause, Play, Plus, Repeat, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { ConfirmDialog } from "#/components/confirm-dialog";
import { CurrencySelect } from "#/components/currency-select";
import { MemberAvatar } from "#/components/member-avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { DatePicker } from "#/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import {
	Field,
	FieldDescription,
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
	hasOpenPopup,
	PopupContainerProvider,
} from "#/components/ui/popup-container";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { currencySymbol } from "#/lib/currencies";
import { atNoon, formatLongDate, formatShortDate } from "#/lib/dates";
import { formatMinor, parseMinor } from "#/lib/money";
import type { MutationInput } from "#/server/operations";

type Recurrence = "daily" | "weekly" | "monthly" | "yearly";
type Run = (action: MutationInput, message: string) => Promise<boolean>;

const RECURRENCES: { value: Recurrence; label: string; every: string }[] = [
	{ value: "daily", label: "Daily", every: "every day" },
	{ value: "weekly", label: "Weekly", every: "every week" },
	{ value: "monthly", label: "Monthly", every: "every month" },
	{ value: "yearly", label: "Yearly", every: "every year" },
];

const everyLabel = (recurrence: string) =>
	RECURRENCES.find((option) => option.value === recurrence)?.every ??
	recurrence;

type Member = { userId: string; name: string; image?: string | null };

type Template = {
	id: string;
	recurrence: string;
	nextRunAt: Date | string;
	active: boolean;
	payload: string;
};

type StoredExpense = {
	description: string;
	amountMinor: number;
	currency: string;
	paidByUserId: string;
	participants: { userId: string }[];
};

/**
 * Templates store `{ expense, anchor }` as JSON text. A row that fails to
 * parse still renders, just with less to say, rather than taking the page down.
 */
function storedExpense(payload: string): Partial<StoredExpense> {
	try {
		const parsed = JSON.parse(payload) as { expense?: Partial<StoredExpense> };
		return parsed.expense ?? {};
	} catch {
		return {};
	}
}

/**
 * Everything that repeats in a group, shown above its expenses: what's
 * scheduled, with a pause for the months you're away. Each row says it the
 * way a person would — "Monthly · next 1 Oct · paid by Tushar". Renders
 * nothing until the group has one; `NewRecurringExpense` is the way in.
 */
export function RecurringExpenses({
	groupId,
	templates,
	members,
	currentUserId,
	run,
}: {
	groupId: string;
	templates: Template[];
	members: Member[];
	currentUserId: string;
	run: Run;
}) {
	const names = new Map(members.map((member) => [member.userId, member.name]));
	const [busy, setBusy] = useState<string | null>(null);
	const sorted = [...templates].sort(
		(a, b) =>
			Number(b.active) - Number(a.active) ||
			new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime(),
	);

	if (sorted.length === 0) return null;

	return (
		<section
			aria-labelledby="recurring-heading"
			className="flex flex-col gap-3"
		>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h2 id="recurring-heading" className="text-base font-semibold">
						Recurring
					</h2>
					<p className="text-sm text-muted-foreground">
						Added to the group automatically on schedule.
					</p>
				</div>
				<NewRecurringExpense
					groupId={groupId}
					members={members}
					currentUserId={currentUserId}
					run={run}
				/>
			</div>
			<ul className="island-shell divide-y overflow-hidden rounded-2xl">
				{sorted.map((template) => {
					const expense = storedExpense(template.payload);
					const label = expense.description ?? "Recurring expense";
					const payer = expense.paidByUserId
						? (names.get(expense.paidByUserId) ?? "someone")
						: null;
					return (
						<li
							key={template.id}
							className="flex items-center gap-3 py-3 ps-4 pe-2 sm:ps-5 sm:pe-3"
							data-paused={!template.active || undefined}
						>
							<span
								className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
								aria-hidden="true"
							>
								<Repeat className="size-4" />
							</span>
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="flex min-w-0 items-center gap-2">
									<span className="truncate text-sm font-medium">{label}</span>
									{template.active ? null : (
										<Badge variant="outline">Paused</Badge>
									)}
								</span>
								<span className="truncate text-sm text-muted-foreground">
									{capitalise(everyLabel(template.recurrence))}
									{template.active
										? ` · next ${formatShortDate(template.nextRunAt)}`
										: ""}
									{payer ? ` · paid by ${payer}` : ""}
								</span>
							</span>
							{expense.amountMinor != null && expense.currency ? (
								<span className="tabular shrink-0 text-sm font-medium">
									{formatMinor(expense.amountMinor, expense.currency)}
								</span>
							) : null}
							<span className="flex shrink-0 items-center">
								<Button
									size="icon-sm"
									variant="ghost"
									className="text-muted-foreground"
									disabled={busy === template.id}
									aria-label={
										template.active ? `Pause ${label}` : `Resume ${label}`
									}
									onClick={async () => {
										setBusy(template.id);
										await run(
											{
												action: "recurring.update",
												input: {
													templateId: template.id,
													active: !template.active,
												},
											},
											template.active
												? "Recurring expense paused"
												: "Recurring expense resumed",
										);
										setBusy(null);
									}}
								>
									{busy === template.id ? (
										<Spinner />
									) : template.active ? (
										<Pause />
									) : (
										<Play />
									)}
								</Button>
								<ConfirmDialog
									media={<Trash2 />}
									title={`Delete “${label}”?`}
									description="Expenses it already added stay in the group. Nothing new is added from now on."
									confirmLabel="Delete recurring expense"
									onConfirm={() =>
										run(
											{
												action: "recurring.delete",
												input: { templateId: template.id },
											},
											"Recurring expense deleted",
										)
									}
									trigger={
										<Button
											size="icon-sm"
											variant="ghost"
											className="text-muted-foreground hover:text-destructive"
											aria-label={`Delete ${label}`}
										>
											<Trash2 />
										</Button>
									}
								/>
							</span>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

function capitalise(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function tomorrow() {
	const date = new Date();
	date.setDate(date.getDate() + 1);
	return atNoon(date);
}

export function NewRecurringExpense({
	groupId,
	members,
	currentUserId,
	run,
	trigger,
}: {
	groupId: string;
	members: Member[];
	currentUserId: string;
	run: Run;
	trigger?: ReactNode;
}) {
	const everyone = () => members.map((member) => member.userId);
	const [open, setOpen] = useState(false);
	/* The currency list portals into the dialog; see `popup-container.tsx`. */
	const [content, setContent] = useState<HTMLElement | null>(null);
	const [description, setDescription] = useState("");
	const [amount, setAmount] = useState("");
	const [currency, setCurrency] = useState("INR");
	const [recurrence, setRecurrence] = useState<Recurrence>("monthly");
	const [startsOn, setStartsOn] = useState<Date>(tomorrow);
	const [paidBy, setPaidBy] = useState(currentUserId);
	const [participants, setParticipants] = useState<string[]>(everyone);
	const [saving, setSaving] = useState(false);

	const amountMinor = parseMinor(amount, currency);
	const missing = !description.trim()
		? "Add a description."
		: amountMinor === null
			? "Enter an amount."
			: participants.length === 0
				? "Choose at least one person to split with."
				: null;

	const reset = () => {
		setDescription("");
		setAmount("");
		setRecurrence("monthly");
		setStartsOn(tomorrow());
		setPaidBy(currentUserId);
		setParticipants(everyone());
	};

	const payerName =
		members.find((member) => member.userId === paidBy)?.name ?? "someone";
	const splitLabel =
		members.length === 1
			? null
			: participants.length === members.length
				? `everyone (${members.length})`
				: `${participants.length} ${participants.length === 1 ? "person" : "people"}`;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger asChild>
				{trigger ?? (
					<Button variant="outline">
						<Plus data-icon="inline-start" />
						New recurring
					</Button>
				)}
			</DialogTrigger>
			<DialogContent
				ref={setContent}
				className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
				onEscapeKeyDown={(event) => {
					if (hasOpenPopup(content)) event.preventDefault();
				}}
			>
				<PopupContainerProvider container={content}>
					<form
						className="flex flex-col gap-6"
						onSubmit={async (event) => {
							event.preventDefault();
							if (missing || amountMinor === null || saving) return;
							setSaving(true);
							const ok = await run(
								{
									action: "recurring.create",
									input: {
										groupId,
										recurrence,
										nextRunAt: startsOn,
										active: true,
										payload: {
											description: description.trim(),
											amountMinor,
											currency,
											paidByUserId: paidBy,
											splitMethod: "even",
											participants: participants.map((userId) => ({
												userId,
												input: null,
											})),
										},
									},
								},
								"Recurring expense added",
							);
							setSaving(false);
							if (!ok) return;
							setOpen(false);
							reset();
						}}
					>
						<DialogHeader>
							<DialogTitle>New recurring expense</DialogTitle>
							<DialogDescription>
								Added to the group automatically on schedule, split evenly by
								weight.
							</DialogDescription>
						</DialogHeader>

						<div className="flex flex-col gap-5">
							<Field className="gap-1.5">
								<FieldLabel htmlFor="recurring-description">
									Description
								</FieldLabel>
								<Input
									id="recurring-description"
									value={description}
									maxLength={200}
									onChange={(event) => setDescription(event.target.value)}
									placeholder="Rent, Netflix, cleaner…"
								/>
							</Field>

							<div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem]">
								<Field className="gap-1.5">
									<FieldLabel htmlFor="recurring-amount">Amount</FieldLabel>
									<InputGroup>
										<InputGroupAddon>
											<InputGroupText>
												{currencySymbol(currency)}
											</InputGroupText>
										</InputGroupAddon>
										<InputGroupInput
											id="recurring-amount"
											inputMode="decimal"
											className="tabular"
											value={amount}
											onChange={(event) => setAmount(event.target.value)}
											placeholder="0.00"
										/>
									</InputGroup>
								</Field>
								<Field className="gap-1.5">
									<FieldLabel htmlFor="recurring-currency">Currency</FieldLabel>
									<CurrencySelect
										id="recurring-currency"
										value={currency}
										onValueChange={setCurrency}
									/>
								</Field>
							</div>

							<Field className="gap-1.5">
								<FieldLabel id="recurring-repeats-label">Repeats</FieldLabel>
								<ToggleGroup
									type="single"
									variant="outline"
									spacing={2}
									rovingFocus={false}
									value={recurrence}
									onValueChange={(value) => {
										if (value) setRecurrence(value as Recurrence);
									}}
									className="flex flex-wrap"
									aria-labelledby="recurring-repeats-label"
								>
									{RECURRENCES.map((option) => (
										<ToggleGroupItem key={option.value} value={option.value}>
											{option.label}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							</Field>

							<div className="grid gap-5 sm:grid-cols-2">
								<Field className="gap-1.5">
									<FieldLabel htmlFor="recurring-starts">First on</FieldLabel>
									<DatePicker
										id="recurring-starts"
										value={startsOn}
										onValueChange={setStartsOn}
										disabled={{ before: atNoon(new Date()) }}
									/>
								</Field>
								<Field className="gap-1.5">
									<FieldLabel htmlFor="recurring-payer">Paid by</FieldLabel>
									<Select value={paidBy} onValueChange={setPaidBy}>
										<SelectTrigger id="recurring-payer" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{members.map((member) => (
													<SelectItem key={member.userId} value={member.userId}>
														{member.name}
														{member.userId === currentUserId ? " (you)" : ""}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
							</div>

							{members.length > 1 ? (
								<FieldSet className="gap-2">
									<div className="flex items-center justify-between gap-3">
										<FieldLegend variant="label" className="mb-0">
											Split between
										</FieldLegend>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() =>
												setParticipants(
													participants.length === members.length
														? []
														: everyone(),
												)
											}
										>
											{participants.length === members.length
												? "Clear"
												: "Everyone"}
										</Button>
									</div>
									<ul className="divide-y rounded-xl border">
										{members.map((member) => {
											const checked = participants.includes(member.userId);
											const inputId = `recurring-with-${member.userId}`;
											return (
												<li key={member.userId}>
													<label
														htmlFor={inputId}
														className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm"
													>
														<Checkbox
															id={inputId}
															checked={checked}
															onCheckedChange={(next) =>
																setParticipants((current) =>
																	next
																		? [...current, member.userId]
																		: current.filter(
																				(userId) => userId !== member.userId,
																			),
																)
															}
														/>
														<MemberAvatar
															name={member.name}
															seed={member.userId}
															image={member.image}
															className="size-7"
														/>
														<span className="truncate">{member.name}</span>
													</label>
												</li>
											);
										})}
									</ul>
								</FieldSet>
							) : null}

							<p
								className="rounded-xl bg-muted px-4 py-3 text-sm text-pretty"
								aria-live="polite"
							>
								{amountMinor !== null ? (
									<span className="tabular font-medium">
										{formatMinor(amountMinor, currency)}
									</span>
								) : (
									"This"
								)}{" "}
								will be added {everyLabel(recurrence)} from{" "}
								<span className="font-medium">{formatLongDate(startsOn)}</span>,
								paid by {payerName}
								{splitLabel ? ` and split between ${splitLabel}` : ""}.
							</p>
						</div>

						<DialogFooter className="items-center">
							{missing ? (
								<FieldDescription className="me-auto">
									{missing}
								</FieldDescription>
							) : null}
							<Button type="submit" disabled={Boolean(missing) || saving}>
								{saving ? <Spinner data-icon="inline-start" /> : null}
								{saving ? "Adding…" : "Add recurring expense"}
							</Button>
						</DialogFooter>
					</form>
				</PopupContainerProvider>
			</DialogContent>
		</Dialog>
	);
}
