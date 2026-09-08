import { useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Amount } from "#/components/amount";
import { MemberAvatar } from "#/components/member-avatar";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
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
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import { Textarea } from "#/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { formatMinor, parseMinor } from "#/lib/money";
import { cn } from "#/lib/utils";
import { computeShares, type SplitMethod } from "#/server/domain/split";
import { mutateFn } from "#/server/fn/app";

type Member = { userId: string; name: string };
type Initial = {
	id: string;
	description: string;
	notes: string | null;
	amountMinor: number;
	paidByUserId: string;
	splitMethod: SplitMethod;
	date: Date;
	shares: { userId: string; splitInput: number | null }[];
};

const methodHelp: Record<SplitMethod, string> = {
	even: "Everyone selected pays the same, to the paise.",
	exact: "Type each person's exact amount. They must add up to the total.",
	shares: "Give each person a weight — 2 shares pays twice as much as 1.",
	percent: "Percentages of the total. They must add up to 100%.",
};

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

function splitInput(method: SplitMethod, raw: string): number | null {
	if (method === "even") return null;
	if (method === "exact") return parseMinor(raw || "0");
	if (method === "percent") {
		const value = Number(raw);
		return Number.isFinite(value) ? Math.round(value * 100) : null;
	}
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

export function ExpenseEditor({
	groupId,
	members,
	currentUserId,
	initial,
}: {
	groupId: string;
	members: Member[];
	currentUserId: string;
	initial?: Initial;
}) {
	const navigate = useNavigate();
	const fieldId = useId();
	const [description, setDescription] = useState(initial?.description ?? "");
	const [notes, setNotes] = useState(initial?.notes ?? "");
	const [amount, setAmount] = useState(
		initial ? (initial.amountMinor / 100).toFixed(2) : "",
	);
	const [payer, setPayer] = useState(initial?.paidByUserId ?? currentUserId);
	const [method, setMethod] = useState<SplitMethod>(
		initial?.splitMethod ?? "even",
	);
	const [date, setDate] = useState(() => {
		const source = initial?.date ? new Date(initial.date) : new Date();
		const year = source.getFullYear();
		const month = String(source.getMonth() + 1).padStart(2, "0");
		const day = String(source.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	});
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
				initial.splitMethod === "percent" || initial.splitMethod === "exact"
					? String((share.splitInput ?? 0) / 100)
					: String(share.splitInput ?? 1),
			]) ?? [],
		),
	);
	const [saving, setSaving] = useState(false);

	const changeMethod = (next: SplitMethod) => {
		if (next === method) return;
		setMethod(next);
		if (next !== "even") setInputs(defaultInputs(next, [...selected].sort()));
	};

	let totalMinor = 0;
	let preview: ReturnType<typeof computeShares> = [];
	let invalid = "";
	const amountMinor = parseMinor(amount);
	if (amountMinor === null) {
		invalid = "Enter a valid amount with at most two decimals";
	} else {
		try {
			totalMinor = amountMinor;
			const participants: { userId: string; input: number | null }[] = [];
			for (const member of members) {
				if (!selected.has(member.userId)) continue;
				const input = splitInput(method, inputs[member.userId] ?? "");
				if (method !== "even" && input === null) {
					invalid = "Enter a valid amount with at most two decimals";
					break;
				}
				participants.push({ userId: member.userId, input });
			}
			if (!invalid) preview = computeShares(totalMinor, method, participants);
		} catch (error) {
			preview = [];
			invalid = error instanceof Error ? error.message : "Invalid split";
		}
	}

	const missingDescription = !description.trim();
	const blocked = Boolean(invalid) || missingDescription || saving;

	const submit = async () => {
		setSaving(true);
		try {
			const base = {
				description,
				notes: notes || null,
				amountMinor: totalMinor,
				currency: "INR" as const,
				paidByUserId: payer,
				splitMethod: method,
				date: new Date(`${date}T12:00:00`),
				participants: preview.map((share) => ({
					userId: share.userId,
					input: share.splitInput,
				})),
			};
			await mutateFn({
				data: initial
					? {
							action: "expense.update",
							input: { ...base, expenseId: initial.id },
						}
					: { action: "expense.create", input: { ...base, groupId } },
			});
			toast.success(initial ? "Expense updated" : "Expense added");
			await navigate({
				to: "/app/groups/$groupId",
				params: { groupId },
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save expense",
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
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

				<Field>
					<FieldLabel htmlFor={`${fieldId}-amount`}>Amount</FieldLabel>
					<InputGroup className="h-12">
						<InputGroupAddon>
							<InputGroupText className="text-lg">₹</InputGroupText>
						</InputGroupAddon>
						<InputGroupInput
							id={`${fieldId}-amount`}
							inputMode="decimal"
							placeholder="0.00"
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
							className="tabular text-lg font-semibold"
						/>
					</InputGroup>
				</Field>

				<div className="grid gap-4 sm:grid-cols-2">
					<Field>
						<FieldLabel htmlFor={`${fieldId}-date`}>Date</FieldLabel>
						<Input
							id={`${fieldId}-date`}
							type="date"
							value={date}
							onChange={(event) => setDate(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor={`${fieldId}-payer`}>Paid by</FieldLabel>
						<Select value={payer} onValueChange={setPayer}>
							<SelectTrigger id={`${fieldId}-payer`} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent position="popper">
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

			<Card className="island-shell">
				<CardHeader>
					<CardTitle className="display-title text-lg font-bold">
						Split between
					</CardTitle>
					<CardDescription>{methodHelp[method]}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<ToggleGroup
						type="single"
						variant="outline"
						spacing={2}
						rovingFocus={false}
						value={method}
						onValueChange={(value) => {
							if (value && value !== method) changeMethod(value as SplitMethod);
						}}
						className="grid w-full grid-cols-4"
						aria-label="Split method"
					>
						<ToggleGroupItem value="even">Even</ToggleGroupItem>
						<ToggleGroupItem value="exact">Exact</ToggleGroupItem>
						<ToggleGroupItem value="shares">Shares</ToggleGroupItem>
						<ToggleGroupItem value="percent">Percent</ToggleGroupItem>
					</ToggleGroup>

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
									<Item key={member.userId} size="sm">
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
										<ItemMedia>
											<MemberAvatar
												name={member.name}
												seed={member.userId}
												className="size-8"
											/>
										</ItemMedia>
										<ItemContent>
											<ItemTitle>
												<FieldLabel
													htmlFor={boxId}
													className={cn(
														"cursor-pointer font-medium",
														!isOn && "text-muted-foreground line-through",
													)}
												>
													{member.name}
												</FieldLabel>
											</ItemTitle>
										</ItemContent>
										{method !== "even" ? (
											<ItemActions key="input">
												<InputGroup className="w-24">
													{method === "exact" ? (
														<InputGroupAddon>
															<InputGroupText>₹</InputGroupText>
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
											<span className="w-24 text-right font-semibold">
												{share ? (
													<Amount minor={share.amountMinor} />
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

					<Alert
						role="status"
						className={cn(
							invalid
								? "border-destructive/40 bg-destructive/10 text-destructive"
								: "border-positive/30 bg-positive/10 text-positive [&>svg]:text-positive",
						)}
					>
						<AlertTitle>
							{invalid || `Assigned exactly ${formatMinor(totalMinor)}`}
						</AlertTitle>
						<AlertDescription>
							{selected.size} {selected.size === 1 ? "person" : "people"}
						</AlertDescription>
					</Alert>
				</CardContent>
				<CardFooter className="flex-col gap-2">
					<Button
						size="lg"
						className="w-full"
						disabled={blocked}
						onClick={submit}
					>
						{saving ? <Spinner data-icon="inline-start" /> : null}
						{saving ? "Saving…" : initial ? "Save changes" : "Add expense"}
					</Button>
					{missingDescription && !saving ? (
						<p className="text-center text-xs text-muted-foreground">
							Add a description to continue.
						</p>
					) : null}
				</CardFooter>
			</Card>
		</div>
	);
}
