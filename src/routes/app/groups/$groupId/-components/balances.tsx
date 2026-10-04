import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, Check, HandCoins, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Amount } from "#/components/amount";
import { BalanceBar } from "#/components/balance-bar";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { HistoryContinuation } from "#/components/history-continuation";
import { MemberAvatar } from "#/components/member-avatar";
import { MemberProfileDetails } from "#/components/member-profile";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "#/components/ui/input-group";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
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
import { currencies, currencySymbol } from "#/lib/currencies";
import { formatMinor, fromMinor, parseMinor } from "#/lib/money";
import { settlementsInfiniteOptions } from "#/lib/queries";
import { repaymentLimit, validateRepayment } from "#/lib/settlements";
import { LoadError, type LoaderData, Loading, type Run } from "./shared";

/* ---------------------------------------------------------------- Balances */

export function BalancesTab({
	data,
	groupId,
	run,
	settleRequest,
}: {
	data: LoaderData;
	groupId: string;
	run: Run;
	/** Changes when the command palette asks for the payment dialog. */
	settleRequest: number;
}) {
	const history = useInfiniteQuery(settlementsInfiniteOptions(groupId));
	const settlements = history.data?.pages.flatMap((page) => page.items) ?? [];
	const [settleTo, setSettleTo] = useState(
		data.balances.transfers.find((row) => row.from.userId === data.user.id)?.to
			.userId ?? "",
	);
	const [settleAmount, setSettleAmount] = useState("");
	const [settleNote, setSettleNote] = useState("");
	const [settleOpen, setSettleOpen] = useState(false);
	const [settleCurrency, setSettleCurrency] = useState(
		data.balances.transfers.find((row) => row.from.userId === data.user.id)
			?.currency ?? "INR",
	);
	const [saving, setSaving] = useState(false);
	// Errors wait for a submit (or for typing an amount) rather than greeting an
	// empty form; the button stays live so it can explain what's missing.
	const [attempted, setAttempted] = useState(false);
	useEffect(() => {
		if (settleRequest > 0) setSettleOpen(true);
	}, [settleRequest]);
	const repayment = {
		fromUserId: data.user.id,
		toUserId: settleTo,
		currency: settleCurrency,
		amountMinor: parseMinor(settleAmount, settleCurrency),
	};
	const invalid = validateRepayment(data.balances.transfers, repayment);
	const recipientError = attempted && !settleTo ? "Choose who you paid" : null;
	const amountError = !settleAmount.trim()
		? attempted
			? "Enter an amount"
			: null
		: settleTo && (attempted || settleAmount)
			? invalid
			: null;
	const limit = repaymentLimit(data.balances.transfers, repayment);
	const recipient = data.group.members.find(
		(member) => member.userId === settleTo,
	);

	// Each currency settles on its own, so its rows sit under their own heading.
	const byCurrency = new Map<string, LoaderData["balances"]["members"]>();
	for (const row of data.balances.members)
		byCurrency.set(row.currency, [
			...(byCurrency.get(row.currency) ?? []),
			row,
		]);
	const balancesByCurrency = [...byCurrency];

	const max = (currency: string) =>
		Math.max(
			1,
			...data.balances.members
				.filter((row) => row.currency === currency)
				.map((row) => Math.abs(row.balanceMinor)),
		);

	return (
		<div className="grid gap-5 lg:grid-cols-2">
			<Card className="island-shell">
				<CardHeader>
					<CardTitle>Net balances</CardTitle>
					<CardDescription>
						A positive amount means the group owes them. Each currency is
						settled separately.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					{balancesByCurrency.map(([currency, rows]) => (
						<section
							key={currency}
							aria-label={
								balancesByCurrency.length > 1
									? `${currency} balances`
									: undefined
							}
							className="flex flex-col gap-3"
						>
							{balancesByCurrency.length > 1 ? (
								<h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
									{currency}
								</h3>
							) : null}
							<ul className="flex flex-col gap-4">
								{rows.map((row) => (
									<li
										key={`${row.userId}-${row.currency}`}
										className="flex flex-col gap-2"
									>
										<div className="flex items-center gap-3">
											<MemberAvatar
												name={row.name}
												seed={row.userId}
												image={row.image}
												className="size-8"
											/>
											<span className="min-w-0 flex-1 truncate font-medium">
												{row.name}
												{row.userId === data.user.id && (
													<span className="text-muted-foreground"> (you)</span>
												)}
											</span>
											<span className="text-right">
												<span className="block font-bold">
													<Amount
														minor={row.balanceMinor}
														currency={row.currency}
														tone="signed"
													/>
												</span>
												<span className="block text-[11px] text-muted-foreground">
													{row.balanceMinor === 0
														? "settled"
														: row.balanceMinor > 0
															? "is owed"
															: "owes"}
												</span>
											</span>
										</div>
										<BalanceBar
											minor={row.balanceMinor}
											max={max(row.currency)}
											label={`${row.name} ${
												row.balanceMinor === 0
													? "is settled up"
													: row.balanceMinor > 0
														? `is owed ${formatMinor(row.balanceMinor, row.currency)}`
														: `owes ${formatMinor(-row.balanceMinor, row.currency)}`
											}`}
										/>
									</li>
								))}
							</ul>
						</section>
					))}
				</CardContent>
			</Card>

			<div className="flex flex-col gap-5">
				<Card className="island-shell">
					<CardHeader>
						<CardTitle>Simplified debts</CardTitle>
						<CardDescription>
							Suggested payments to settle everyone, per currency.
						</CardDescription>
						<CardAction>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setSettleOpen(true)}
							>
								Record payment
							</Button>
						</CardAction>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{data.balances.transfers.length === 0 ? (
							<p className="flex items-center gap-2 text-sm text-positive">
								<Check className="size-4" aria-hidden="true" />
								Everyone is settled up.
							</p>
						) : (
							<ItemGroup>
								{data.balances.transfers.map((transfer) => (
									<Item
										key={`${transfer.from.userId}-${transfer.to.userId}-${transfer.currency}`}
										variant="outline"
										size="sm"
									>
										<ItemContent>
											<ItemTitle>
												{transfer.from.name}
												<ArrowRight
													className="size-3.5 text-muted-foreground"
													aria-hidden="true"
												/>
												{transfer.to.name}
											</ItemTitle>
										</ItemContent>
										<ItemActions>
											<strong className="tabular">
												{formatMinor(transfer.amountMinor, transfer.currency)}
											</strong>
											{transfer.from.userId === data.user.id ? (
												<>
													{data.paymentIntents.intents.find(
														(intent) =>
															intent.fromUserId === transfer.from.userId &&
															intent.toUserId === transfer.to.userId &&
															intent.currency === transfer.currency &&
															intent.amountMinor === transfer.amountMinor,
													)?.upiUrl ? (
														<Button size="sm" variant="outline" asChild>
															<a
																href={
																	data.paymentIntents.intents.find(
																		(intent) =>
																			intent.fromUserId ===
																				transfer.from.userId &&
																			intent.toUserId === transfer.to.userId &&
																			intent.currency === transfer.currency &&
																			intent.amountMinor ===
																				transfer.amountMinor,
																	)?.upiUrl ?? undefined
																}
															>
																Pay via UPI
															</a>
														</Button>
													) : null}
													<Button
														size="sm"
														onClick={() => {
															setSettleTo(transfer.to.userId);
															setSettleCurrency(transfer.currency);
															setSettleAmount(
																fromMinor(
																	transfer.amountMinor,
																	transfer.currency,
																),
															);
															setSettleOpen(true);
														}}
													>
														Record payment
													</Button>
												</>
											) : null}
										</ItemActions>
									</Item>
								))}
							</ItemGroup>
						)}

						<Dialog
							open={settleOpen}
							onOpenChange={(open) => {
								setSettleOpen(open);
								if (!open) setAttempted(false);
							}}
						>
							<DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
								<form
									noValidate
									className="contents"
									onSubmit={async (event) => {
										event.preventDefault();
										setAttempted(true);
										if (invalid || repayment.amountMinor === null || saving)
											return;
										setSaving(true);
										const saved = await run(
											{
												action: "settlement.create",
												input: {
													groupId,
													toUserId: settleTo,
													amountMinor: repayment.amountMinor,
													currency: settleCurrency,
													note: settleNote || null,
												},
											},
											"Payment recorded",
										);
										setSaving(false);
										if (!saved) return;
										setSettleOpen(false);
										setAttempted(false);
										setSettleAmount("");
										setSettleNote("");
									}}
								>
									<DialogHeader>
										<DialogTitle>Record a payment</DialogTitle>
										<DialogDescription>
											Record money you actually paid to another member. Matching
											shares are marked paid automatically.
										</DialogDescription>
									</DialogHeader>
									<FieldGroup>
										<Field data-invalid={Boolean(recipientError)}>
											<FieldLabel htmlFor="settle-to">Paid to</FieldLabel>
											<Select value={settleTo} onValueChange={setSettleTo}>
												<SelectTrigger
													id="settle-to"
													className="w-full"
													aria-invalid={Boolean(recipientError)}
													aria-describedby="settle-to-error"
												>
													<SelectValue placeholder="Choose member" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{data.group.members
															.filter(
																(member) => member.userId !== data.user.id,
															)
															.map((member) => (
																<SelectItem
																	key={member.userId}
																	value={member.userId}
																>
																	{member.name}
																</SelectItem>
															))}
													</SelectGroup>
												</SelectContent>
											</Select>
											<FieldError id="settle-to-error">
												{recipientError}
											</FieldError>
										</Field>
										{recipient && <MemberProfileDetails member={recipient} />}
										<Field data-invalid={Boolean(amountError)}>
											<FieldLabel htmlFor="settle-amount">Amount</FieldLabel>
											{/*
											 * The currency rides in front of the number it qualifies,
											 * as its symbol, rather than as a field of its own.
											 */}
											<InputGroup className="has-[>[data-align=inline-start]]:[&>input]:pl-3">
												<InputGroupAddon className="cursor-auto pl-1 has-[>button]:ml-0">
													<Select
														value={settleCurrency}
														onValueChange={(value) => {
															setSettleCurrency(value);
															setSettleAmount("");
														}}
													>
														<SelectTrigger
															size="sm"
															aria-label={`Currency, ${settleCurrency}`}
															className="h-7 gap-1 rounded-[calc(var(--radius-md)-4px)] border-0 bg-transparent px-1.5 text-foreground shadow-none dark:bg-transparent dark:hover:bg-muted"
														>
															<span className="tabular">
																{currencySymbol(settleCurrency)}
															</span>
														</SelectTrigger>
														<SelectContent>
															<SelectGroup>
																{currencies.map(({ code, name }) => (
																	<SelectItem key={code} value={code}>
																		<span className="w-8 tabular">
																			{currencySymbol(code)}
																		</span>
																		{code}
																		<span className="text-xs text-muted-foreground">
																			{name}
																		</span>
																	</SelectItem>
																))}
															</SelectGroup>
														</SelectContent>
													</Select>
												</InputGroupAddon>
												<InputGroupInput
													id="settle-amount"
													aria-invalid={Boolean(amountError)}
													aria-describedby="settle-limit settle-error"
													inputMode="decimal"
													className="tabular"
													placeholder={fromMinor(0, settleCurrency)}
													value={settleAmount}
													onChange={(event) =>
														setSettleAmount(event.target.value)
													}
												/>
											</InputGroup>
											<FieldDescription id="settle-limit">
												Maximum: {formatMinor(limit, settleCurrency)} based on
												current simplified debts.
											</FieldDescription>
											<FieldError id="settle-error">{amountError}</FieldError>
										</Field>
										<Field>
											<FieldLabel htmlFor="settle-note">Note</FieldLabel>
											<Textarea
												id="settle-note"
												rows={2}
												placeholder="UPI, cash, …"
												value={settleNote}
												onChange={(event) => setSettleNote(event.target.value)}
											/>
											<FieldDescription>Optional.</FieldDescription>
										</Field>
									</FieldGroup>
									<DialogFooter>
										<Button type="submit" disabled={saving}>
											{saving ? <Spinner data-icon="inline-start" /> : null}
											Record payment
										</Button>
									</DialogFooter>
								</form>
							</DialogContent>
						</Dialog>
					</CardContent>
				</Card>

				<Card className="island-shell">
					<CardHeader>
						<CardTitle>Payment history</CardTitle>
					</CardHeader>
					<CardContent>
						{history.isPending ? (
							<Loading label="Loading payments…" />
						) : history.isError && settlements.length === 0 ? (
							<LoadError
								icon={HandCoins}
								title="Couldn't load payments"
								query={history}
							/>
						) : settlements.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No payments recorded yet.
							</p>
						) : (
							<ItemGroup>
								{settlements.map((row) => (
									<Item key={row.id} size="sm">
										<ItemContent>
											<ItemTitle>
												{row.from.name} paid {row.to.name}
											</ItemTitle>
											{row.note ? (
												<ItemDescription>{row.note}</ItemDescription>
											) : null}
										</ItemContent>
										<ItemActions>
											<strong className="tabular">
												{formatMinor(row.amountMinor, row.currency)}
											</strong>
											<ConfirmDialog
												media={<Trash2 />}
												title="Delete payment?"
												description={`${formatMinor(row.amountMinor, row.currency)} from ${row.from.name} to ${row.to.name} will be erased from everyone's balances.`}
												confirmLabel="Delete payment"
												onConfirm={() =>
													run(
														{
															action: "settlement.delete",
															input: { settlementId: row.id },
														},
														"Payment deleted",
													)
												}
												trigger={
													<Button
														size="icon-sm"
														variant="ghost"
														className="press text-destructive"
														aria-label={`Delete payment of ${formatMinor(
															row.amountMinor,
															row.currency,
														)}`}
													>
														<Trash2 />
													</Button>
												}
											/>
										</ItemActions>
									</Item>
								))}
							</ItemGroup>
						)}
						{history.isError && settlements.length === 0 ? null : (
							<HistoryContinuation query={history} label="payments" />
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
