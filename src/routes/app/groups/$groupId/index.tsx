import {
	useInfiniteQuery,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	Archive,
	ArchiveRestore,
	ArrowRight,
	Check,
	Copy,
	Download,
	History,
	LogOut,
	MoreHorizontal,
	Plus,
	Receipt,
	Repeat,
	Search,
	Trash2,
	UserMinus,
	UserPlus,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ActivityLine } from "#/components/activity-line";
import { Amount } from "#/components/amount";
import { AppBreadcrumb } from "#/components/app-breadcrumb";
import { BalanceBar } from "#/components/balance-bar";
import { useComposer } from "#/components/composer";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { CurrencySelect } from "#/components/currency-select";
import { EmptyState } from "#/components/empty-state";
import { ExpenseTable } from "#/components/expense-table";
import { MemberAvatar } from "#/components/member-avatar";
import {
	MemberProfileDetails,
	MemberProfileDialog,
} from "#/components/member-profile";
import {
	NewRecurringExpense,
	RecurringExpenses,
} from "#/components/recurring-expenses";
import { SettingsRow, SettingsSection } from "#/components/settings-section";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
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
	DialogTrigger,
} from "#/components/ui/dialog";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupText,
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
import { Separator } from "#/components/ui/separator";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "#/components/ui/sheet";
import { Spinner } from "#/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import { useAppMutation } from "#/lib/app-mutation";
import { copyToClipboard } from "#/lib/clipboard";
import { currencySymbol } from "#/lib/currencies";
import { formatMinor, fromMinor, parseMinor } from "#/lib/money";
import {
	expensePageQueryOptions,
	expensePageSize,
	groupActivityInfiniteOptions,
	groupPageQueryOptions,
} from "#/lib/queries";
import { repaymentLimit, validateRepayment } from "#/lib/settlements";
import type { getGroupPageFn } from "#/lib/web-api-client";
import type { MutationInput } from "#/server/operations";
import type { ExpenseSortBy } from "#/server/schemas/expenses";

export const Route = createFileRoute("/app/groups/$groupId/")({
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(groupPageQueryOptions(params.groupId)),
	component: GroupPage,
});

const ROLES = ["owner", "admin", "member"] as const;
type Role = (typeof ROLES)[number];

type LoaderData = Awaited<ReturnType<typeof getGroupPageFn>>;
type Run = (action: MutationInput, message: string) => Promise<boolean>;
type Execute = ReturnType<typeof useAppMutation>["execute"];

function GroupPage() {
	const { groupId } = Route.useParams();
	const { data, isFetching } = useSuspenseQuery(groupPageQueryOptions(groupId));
	const navigate = useNavigate();
	const composer = useComposer();
	const { run, execute } = useAppMutation();

	const mine = data.balances.members.filter(
		(row) => row.userId === data.user.id,
	);

	return (
		<div className="flex flex-col gap-6 sm:gap-8">
			<AppBreadcrumb
				parent={{ label: "All groups", to: "/app" }}
				page={data.group.name}
			/>
			<header className="rise-in flex flex-wrap items-end justify-between gap-4">
				<div className="min-w-0">
					<p className="island-kicker capitalize">{data.group.myRole}</p>
					<h1 className="display-title flex flex-wrap items-center gap-3 text-[2.125rem] font-bold sm:text-5xl">
						{data.group.name}
						{isFetching ? (
							<span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
								<Spinner className="size-3" />
								Updating
							</span>
						) : null}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{data.group.members.length}{" "}
						{data.group.members.length === 1 ? "member" : "members"}
						{mine
							.filter((row) => row.balanceMinor !== 0)
							.map((row) => (
								<span key={row.currency}>
									{" · "}
									{row.balanceMinor > 0 ? "you are owed " : "you owe "}
									<Amount
										minor={Math.abs(row.balanceMinor)}
										currency={row.currency}
									/>
								</span>
							))}
					</p>
				</div>
				{/* Duplicated by the tab bar's centre action on a phone. */}
				<Button
					className="hidden sm:inline-flex"
					onClick={() => composer.expense({ groupId })}
				>
					<Plus data-icon="inline-start" />
					Add expense
				</Button>
			</header>

			<Tabs defaultValue="expenses">
				{/*
				 * Five tabs never fit across a phone, so the track scrolls and snaps
				 * instead of squeezing, and `shrink-0` stops the triggers collapsing
				 * to fit. Radix doesn't scroll its own track, so tapping a pill that
				 * is only half on screen pulls it the rest of the way in — otherwise
				 * "Settings" sits permanently clipped at the right edge. Keyboard
				 * users get this free: the browser scrolls whatever it focuses.
				 */}
				<TabsList
					className="segmented rail h-auto w-fit max-w-full justify-start p-1 [&>*]:shrink-0 [&>*]:px-4"
					onClick={(event) =>
						(event.target as HTMLElement)
							.closest('[data-slot="tabs-trigger"]')
							?.scrollIntoView({
								behavior: "smooth",
								inline: "nearest",
								block: "nearest",
							})
					}
				>
					<TabsTrigger value="expenses">Expenses</TabsTrigger>
					<TabsTrigger value="balances">Balances</TabsTrigger>
					<TabsTrigger value="members">Members</TabsTrigger>
					<TabsTrigger value="activity">Activity</TabsTrigger>
					<TabsTrigger value="settings">Settings</TabsTrigger>
				</TabsList>

				<TabsContent value="expenses" className="mt-6 sm:mt-8">
					<ExpensesTab key={groupId} data={data} groupId={groupId} run={run} />
				</TabsContent>
				<TabsContent value="balances" className="mt-6 sm:mt-8">
					<BalancesTab data={data} groupId={groupId} run={run} />
				</TabsContent>
				<TabsContent value="members" className="mt-6 sm:mt-8">
					<MembersTab
						data={data}
						groupId={groupId}
						run={run}
						execute={execute}
					/>
				</TabsContent>
				<TabsContent value="activity" className="mt-6 sm:mt-8">
					<ActivityTab data={data} groupId={groupId} />
				</TabsContent>
				<TabsContent value="settings" className="mt-6 sm:mt-8">
					<SettingsTab
						data={data}
						groupId={groupId}
						run={run}
						execute={execute}
						onLeave={() => navigate({ to: "/app" })}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}

/* ---------------------------------------------------------------- Expenses */

function ExpensesTab({
	data,
	groupId,
	run,
}: {
	data: LoaderData;
	groupId: string;
	run: Run;
}) {
	const composer = useComposer();
	const [search, setSearch] = useState("");
	const [submitted, setSubmitted] = useState("");
	const [page, setPage] = useState(0);
	const [sort, setSort] = useState<{ id: ExpenseSortBy; desc: boolean }>({
		id: "date",
		desc: true,
	});
	const searching = submitted.length > 0;
	const expenseQuery = useQuery({
		...expensePageQueryOptions(
			groupId,
			submitted,
			sort.id,
			sort.desc ? "desc" : "asc",
			page * expensePageSize,
		),
		initialData:
			!searching && page === 0 && sort.id === "date" && sort.desc
				? data.expenses
				: undefined,
	});

	useEffect(() => {
		if (!expenseQuery.isError) return;
		toast.error(
			expenseQuery.error instanceof Error
				? expenseQuery.error.message
				: "Could not load expenses",
		);
	}, [expenseQuery.isError, expenseQuery.error]);

	const hasRecurring = data.recurringExpenses.length > 0;
	const recurring = (
		<RecurringExpenses
			groupId={groupId}
			templates={data.recurringExpenses}
			members={data.group.members}
			currentUserId={data.user.id}
			run={run}
		/>
	);
	const newRecurring = (trigger?: ReactNode) => (
		<NewRecurringExpense
			groupId={groupId}
			members={data.group.members}
			currentUserId={data.user.id}
			run={run}
			trigger={trigger}
		/>
	);

	if (data.expenses.items.length === 0 && !searching)
		return (
			<div className="flex flex-col gap-10 sm:gap-12">
				{recurring}
				<EmptyState
					icon={Receipt}
					title="No expenses yet"
					description="Add the first shared cost and Eventual works out who owes what in each currency."
					action={
						<div className="flex flex-wrap justify-center gap-2">
							<Button onClick={() => composer.expense({ groupId })}>
								<Plus data-icon="inline-start" />
								Add expense
							</Button>
							{hasRecurring
								? null
								: newRecurring(
										<Button variant="outline">
											<Repeat data-icon="inline-start" />
											Set up recurring
										</Button>,
									)}
						</div>
					}
				/>
			</div>
		);

	const items = expenseQuery.data?.items ?? [];
	const waiting = expenseQuery.isPending;

	return (
		<div className="flex flex-col gap-10 sm:gap-12">
			{recurring}
			<section aria-label="Expenses" className="flex flex-col gap-3">
				<div className="flex gap-2">
					<form
						className="flex min-w-0 flex-1 gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							setSubmitted(search.trim());
							setPage(0);
						}}
					>
						<InputGroup>
							<InputGroupAddon>
								<Search />
							</InputGroupAddon>
							<InputGroupInput
								type="search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search descriptions, notes, or categories"
								aria-label="Search expenses"
							/>
							{expenseQuery.isFetching ? (
								<InputGroupAddon align="inline-end">
									<Spinner />
								</InputGroupAddon>
							) : null}
						</InputGroup>
					</form>
					{hasRecurring
						? null
						: newRecurring(
								<Button variant="outline">
									<Repeat data-icon="inline-start" />
									<span className="sr-only sm:not-sr-only">Recurring</span>
								</Button>,
							)}
				</div>
				{waiting ? (
					<p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
						<Spinner />
						Loading expenses…
					</p>
				) : items.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">
						No expenses match this search.
					</p>
				) : (
					<div className="island-shell overflow-hidden rounded-2xl">
						<ExpenseTable
							rows={items}
							groupId={groupId}
							fetching={expenseQuery.isFetching}
							sort={sort}
							onSortChange={(next) => {
								setSort(next);
								setPage(0);
							}}
						/>
					</div>
				)}
				{!waiting && (page > 0 || expenseQuery.data?.nextOffset != null) ? (
					<nav
						className="flex items-center justify-end gap-3"
						aria-label="Expense pages"
					>
						<Button
							type="button"
							variant="outline"
							disabled={page === 0 || expenseQuery.isFetching}
							onClick={() => setPage((current) => current - 1)}
						>
							Previous
						</Button>
						<span className="text-sm text-muted-foreground">
							Page {page + 1}
						</span>
						<Button
							type="button"
							variant="outline"
							disabled={
								expenseQuery.data?.nextOffset == null || expenseQuery.isFetching
							}
							onClick={() => setPage((current) => current + 1)}
						>
							Next
						</Button>
					</nav>
				) : null}
			</section>
		</div>
	);
}

/* ---------------------------------------------------------------- Balances */

function BalancesTab({
	data,
	groupId,
	run,
}: {
	data: LoaderData;
	groupId: string;
	run: Run;
}) {
	/*
	 * The currency picker is a combobox, and its list portals into whatever this
	 * provides — `popup-container.tsx` explains why it cannot go to the body.
	 */
	const [settleContent, setSettleContent] = useState<HTMLElement | null>(null);
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
	const repayment = {
		fromUserId: data.user.id,
		toUserId: settleTo,
		currency: settleCurrency,
		amountMinor: parseMinor(settleAmount, settleCurrency),
	};
	const invalid = validateRepayment(data.balances.transfers, repayment);
	const limit = repaymentLimit(data.balances.transfers, repayment);
	const recipient = data.group.members.find(
		(member) => member.userId === settleTo,
	);

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
				<CardContent>
					<ul className="flex flex-col gap-4">
						{data.balances.members.map((row) => (
							<li
								key={`${row.userId}-${row.currency}`}
								className="flex flex-col gap-2"
							>
								<div className="flex items-center gap-3">
									<MemberAvatar
										name={row.name}
										seed={row.userId}
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
														Confirm paid
													</Button>
												</>
											) : null}
										</ItemActions>
									</Item>
								))}
							</ItemGroup>
						)}

						<Dialog open={settleOpen} onOpenChange={setSettleOpen}>
							<DialogContent
								className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
								ref={setSettleContent}
								onEscapeKeyDown={(event) => {
									// The currency list gets the first Escape, this dialog the
									// second. See `hasOpenPopup`.
									if (hasOpenPopup(settleContent)) event.preventDefault();
								}}
							>
								<PopupContainerProvider container={settleContent}>
									<DialogHeader>
										<DialogTitle>Record settlement</DialogTitle>
										<DialogDescription>
											Record money you actually paid to another member. Matching
											shares are marked paid automatically.
										</DialogDescription>
									</DialogHeader>
									<FieldGroup>
										<Field>
											<FieldLabel htmlFor="settle-currency">
												Currency
											</FieldLabel>
											<CurrencySelect
												id="settle-currency"
												value={settleCurrency}
												onValueChange={(value) => {
													setSettleCurrency(value);
													setSettleAmount("");
												}}
											/>
										</Field>
										<Field>
											<FieldLabel htmlFor="settle-to">Paid to</FieldLabel>
											<Select value={settleTo} onValueChange={setSettleTo}>
												<SelectTrigger id="settle-to" className="w-full">
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
										</Field>
										{recipient && <MemberProfileDetails member={recipient} />}
										<Field data-invalid={Boolean(settleAmount && invalid)}>
											<FieldLabel htmlFor="settle-amount">Amount</FieldLabel>
											<InputGroup>
												<InputGroupAddon>
													<InputGroupText>
														{currencySymbol(settleCurrency)}
													</InputGroupText>
												</InputGroupAddon>
												<InputGroupInput
													id="settle-amount"
													aria-invalid={Boolean(settleAmount && invalid)}
													aria-describedby="settle-limit settle-error"
													inputMode="decimal"
													className="tabular"
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
											<FieldError id="settle-error">
												{settleAmount ? invalid : null}
											</FieldError>
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
										<Button
											disabled={Boolean(invalid) || saving}
											onClick={async () => {
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
													"Settlement recorded",
												);
												setSaving(false);
												if (!saved) return;
												setSettleOpen(false);
												setSettleAmount("");
												setSettleNote("");
											}}
										>
											Record
										</Button>
									</DialogFooter>
								</PopupContainerProvider>
							</DialogContent>
						</Dialog>
					</CardContent>
				</Card>

				<Card className="island-shell">
					<CardHeader>
						<CardTitle>Payment history</CardTitle>
					</CardHeader>
					<CardContent>
						{data.settlements.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No payments recorded yet.
							</p>
						) : (
							<ItemGroup>
								{data.settlements.map((row) => (
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
												title="Delete settlement?"
												description={`${formatMinor(row.amountMinor, row.currency)} from ${row.from.name} to ${row.to.name} will be erased from everyone's balances.`}
												confirmLabel="Delete settlement"
												onConfirm={() =>
													run(
														{
															action: "settlement.delete",
															input: { settlementId: row.id },
														},
														"Settlement deleted",
													)
												}
												trigger={
													<Button
														size="icon-sm"
														variant="ghost"
														className="press text-destructive"
														aria-label={`Delete settlement of ${formatMinor(
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
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

/* ----------------------------------------------------------------- Members */

/**
 * Row actions for a member, as a sheet. The inline controls opposite need a
 * select and a button side by side, which is more than a phone row can hold —
 * here the same choices get a full-width tap target each.
 */
function MemberSheet({
	member,
	data,
	groupId,
	run,
	canManage,
}: {
	member: LoaderData["group"]["members"][number];
	data: LoaderData;
	groupId: string;
	run: Run;
	canManage: boolean;
}) {
	const isSelf = member.userId === data.user.id;
	const isOwner = data.group.myRole === "owner";
	const canRemove = canManage && !isSelf;

	const [sheetOpen, setSheetOpen] = useState(false);

	// Nothing to do in here: leave the row as a plain badge instead.
	if (!isOwner && !canRemove) return null;

	return (
		<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
			<SheetTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					className="press sm:hidden"
					aria-label={`Manage ${member.name}`}
				>
					<MoreHorizontal />
				</Button>
			</SheetTrigger>
			<SheetContent side="bottom" className="gap-5">
				<SheetHeader className="flex-row items-center gap-3">
					<MemberAvatar
						name={member.name}
						seed={member.userId}
						className="size-10"
					/>
					<span className="flex min-w-0 flex-col">
						<SheetTitle>{member.name}</SheetTitle>
						<SheetDescription className="truncate text-xs">
							{member.email}
						</SheetDescription>
					</span>
				</SheetHeader>

				{isOwner ? (
					<div className="flex flex-col">
						<p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
							Role
						</p>
						{ROLES.map((role) => (
							<SheetClose asChild key={role}>
								<button
									type="button"
									className="sheet-row capitalize"
									onClick={() => {
										if (role === member.role) return;
										run(
											{
												action: "member.role",
												input: { groupId, userId: member.userId, role },
											},
											"Role updated",
										);
									}}
								>
									{role}
									{role === member.role ? (
										<Check className="ml-auto size-4" aria-label="Current" />
									) : null}
								</button>
							</SheetClose>
						))}
					</div>
				) : null}

				{canRemove ? (
					<div className="flex flex-col">
						{isOwner ? <Separator className="mb-1.5" /> : null}
						<ConfirmDialog
							media={<UserMinus />}
							title={`Remove ${member.name}?`}
							description={`${member.name} loses access immediately. Their shares in expenses already recorded stay put, and you can invite them back with a new invitation.`}
							confirmLabel="Remove from group"
							onConfirm={() =>
								run(
									{
										action: "member.remove",
										input: { groupId, userId: member.userId },
									},
									"Member removed",
								).then((ok) => {
									if (ok) setSheetOpen(false);
									return ok;
								})
							}
							trigger={
								<button
									type="button"
									className="sheet-row"
									data-variant="destructive"
								>
									<UserMinus className="size-[1.125rem]" />
									Remove from group
								</button>
							}
						/>
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
}

/**
 * Compact weight editor for one member, shown to those who can manage.
 * Commits on change: only when the value is a valid positive integer that
 * differs from the member's current weight.
 */
function MemberWeight({
	member,
	groupId,
	run,
}: {
	member: LoaderData["group"]["members"][number];
	groupId: string;
	run: Run;
}) {
	const [weight, setWeight] = useState(String(member.weight));
	const value = Number(weight);
	const valid = Number.isInteger(value) && value > 0;

	return (
		<InputGroup className="w-28">
			<InputGroupAddon>
				<InputGroupText>Weight</InputGroupText>
			</InputGroupAddon>
			<InputGroupInput
				type="number"
				min={1}
				step={1}
				aria-label={`Weight for ${member.name}`}
				placeholder="1"
				className="tabular"
				value={weight}
				onChange={(event) => setWeight(event.target.value)}
				onBlur={() => {
					if (value === member.weight) setWeight(String(member.weight));
					if (!valid || value === member.weight) return;
					run(
						{
							action: "member.weight",
							input: { groupId, userId: member.userId, weight: value },
						},
						"Weight updated",
					);
				}}
			/>
		</InputGroup>
	);
}

function MembersTab({
	data,
	groupId,
	run,
	execute,
}: {
	data: LoaderData;
	groupId: string;
	run: Run;
	execute: Execute;
}) {
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviting, setInviting] = useState(false);
	const [inviteRole, setInviteRole] = useState<"owner" | "admin" | "member">(
		"member",
	);
	const [inviteUrl, setInviteUrl] = useState("");
	const [copied, setCopied] = useState(false);
	const canManage = data.group.myRole !== "member";
	const [addOpen, setAddOpen] = useState(false);
	const [addName, setAddName] = useState("");
	const [addEmail, setAddEmail] = useState("");
	const [addPhone, setAddPhone] = useState("");
	const [addWeight, setAddWeight] = useState("1");
	const addWeightValue = addWeight.trim() === "" ? 1 : Number(addWeight);
	const addValid =
		Boolean(addName.trim()) &&
		Number.isInteger(addWeightValue) &&
		addWeightValue > 0;

	return (
		<div className="flex flex-col gap-10 sm:gap-12">
			<section
				aria-labelledby="members-heading"
				className="flex flex-col gap-4"
			>
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div className="flex flex-col gap-1">
						<h2 id="members-heading" className="text-base font-semibold">
							{data.group.members.length}{" "}
							{data.group.members.length === 1 ? "member" : "members"}
						</h2>
						<p className="text-sm text-muted-foreground">
							Owners manage roles; admins add and remove people.
						</p>
					</div>
					{canManage && (
						<div className="flex flex-wrap gap-2">
							<Dialog
								open={addOpen}
								onOpenChange={(open) => {
									setAddOpen(open);
									if (!open) {
										setAddName("");
										setAddEmail("");
										setAddPhone("");
										setAddWeight("1");
									}
								}}
							>
								<DialogTrigger asChild>
									<Button variant="outline">
										<UserPlus data-icon="inline-start" />
										Add person
									</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Add a person</DialogTitle>
										<DialogDescription>
											Add someone without an account yet — for example, a guest
											who pays in cash.
										</DialogDescription>
									</DialogHeader>
									<FieldGroup>
										<Field>
											<FieldLabel htmlFor="add-name">Name</FieldLabel>
											<Input
												id="add-name"
												placeholder="Guest name"
												value={addName}
												onChange={(event) => setAddName(event.target.value)}
											/>
										</Field>
										<Field>
											<FieldLabel htmlFor="add-email">Email</FieldLabel>
											<Input
												id="add-email"
												type="email"
												placeholder="person@example.com"
												value={addEmail}
												onChange={(event) => setAddEmail(event.target.value)}
											/>
											<FieldDescription>Optional.</FieldDescription>
										</Field>
										<Field>
											<FieldLabel htmlFor="add-phone">Phone</FieldLabel>
											<Input
												id="add-phone"
												type="tel"
												inputMode="tel"
												placeholder="+919876543210"
												value={addPhone}
												onChange={(event) => setAddPhone(event.target.value)}
											/>
											<FieldDescription>
												Optional, international format with country code.
											</FieldDescription>
										</Field>
										<Field>
											<FieldLabel htmlFor="add-weight">Weight</FieldLabel>
											<Input
												id="add-weight"
												type="number"
												min={1}
												step={1}
												className="w-20 tabular"
												value={addWeight}
												onChange={(event) => setAddWeight(event.target.value)}
											/>
											<FieldDescription>
												How many shares they count as in an even split. Default
												1.
											</FieldDescription>
										</Field>
									</FieldGroup>
									<DialogFooter>
										<Button
											disabled={!addValid}
											onClick={async () => {
												const ok = await run(
													{
														action: "member.add",
														input: {
															groupId,
															name: addName,
															email: addEmail.trim() || undefined,
															phone: addPhone.trim() || undefined,
															weight: addWeightValue,
														},
													},
													"Person added",
												);
												if (ok) setAddOpen(false);
											}}
										>
											Add person
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
							<Dialog
								onOpenChange={(open) => {
									if (!open) {
										setInviteUrl("");
										setCopied(false);
									}
								}}
							>
								<DialogTrigger asChild>
									<Button>
										<UserPlus data-icon="inline-start" />
										Invite
									</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Invite a member</DialogTitle>
										<DialogDescription>
											We email the invitation when email is configured —
											otherwise share the link yourself.
										</DialogDescription>
									</DialogHeader>
									<FieldGroup>
										<Field>
											<FieldLabel htmlFor="invite-email">Email</FieldLabel>
											<Input
												id="invite-email"
												type="email"
												placeholder="friend@example.com"
												value={inviteEmail}
												onChange={(event) => setInviteEmail(event.target.value)}
											/>
										</Field>
										<Field>
											<FieldLabel htmlFor="invite-role">Role</FieldLabel>
											<Select
												value={inviteRole}
												onValueChange={(value) =>
													setInviteRole(value as typeof inviteRole)
												}
											>
												<SelectTrigger id="invite-role" className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{["member", "admin", "owner"].map((role) => (
															<SelectItem
																key={role}
																value={role}
																className="capitalize"
															>
																{role}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
										</Field>
										<Button
											disabled={inviting || !inviteEmail.trim()}
											onClick={async () => {
												setInviting(true);
												const outcome = await execute({
													action: "invitation.create",
													input: {
														groupId,
														email: inviteEmail,
														role: inviteRole,
													},
												});
												setInviting(false);
												if (
													!outcome.ok ||
													!outcome.result ||
													typeof outcome.result !== "object"
												)
													return;
												if (
													"inviteUrl" in outcome.result &&
													typeof outcome.result.inviteUrl === "string"
												)
													setInviteUrl(
														`${window.location.origin}${outcome.result.inviteUrl}`,
													);
												if (
													"emailDelivery" in outcome.result &&
													outcome.result.emailDelivery === "scheduled"
												)
													toast.success("Invitation email queued");
												setCopied(false);
											}}
										>
											{inviting ? <Spinner data-icon="inline-start" /> : null}
											{inviting ? "Sending…" : "Send invitation"}
										</Button>

										{inviteUrl ? (
											<Alert className="border-primary/30 bg-primary/5">
												<AlertTitle>Share this link</AlertTitle>
												<AlertDescription>
													<InputGroup className="mt-2">
														<InputGroupInput
															id="invite-url"
															readOnly
															value={inviteUrl}
															className="text-xs"
															onFocus={(event) => event.currentTarget.select()}
														/>
														<InputGroupAddon align="inline-end">
															<InputGroupButton
																aria-label={
																	copied ? "Copied" : "Copy invite link"
																}
																onClick={async () => {
																	const ok = await copyToClipboard(
																		inviteUrl,
																		"invite link",
																	);
																	if (!ok) return;
																	setCopied(true);
																	toast.success("Invite link copied");
																}}
															>
																{copied ? <Check /> : <Copy />}
																{copied ? "Copied" : "Copy"}
															</InputGroupButton>
														</InputGroupAddon>
													</InputGroup>
												</AlertDescription>
											</Alert>
										) : null}
									</FieldGroup>
								</DialogContent>
							</Dialog>
						</div>
					)}
				</div>

				<ul className="island-shell divide-y overflow-hidden rounded-2xl">
					{data.group.members.map((member) => (
						<li
							key={member.userId}
							className="flex items-center gap-3 py-3 ps-3 pe-4 sm:gap-4 sm:py-3.5 sm:ps-4 sm:pe-6"
						>
							<MemberProfileDialog
								member={member}
								trigger={
									<button
										type="button"
										className="press flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted/60"
									>
										<MemberAvatar
											name={member.name}
											seed={member.userId}
											image={member.image}
										/>
										<span className="flex min-w-0 flex-col">
											<span className="truncate text-sm font-medium">
												{member.name}
												{member.userId === data.user.id ? (
													<span className="text-muted-foreground"> (you)</span>
												) : null}
											</span>
											<span className="truncate text-sm text-muted-foreground">
												{member.isGuest ? "Guest" : member.email}
											</span>
										</span>
										<span className="sr-only">, view profile</span>
									</button>
								}
							/>

							{/* Phone: the role reads as a badge and everything you can do
							    to this person is one tap away in a sheet. */}
							<div className="flex shrink-0 items-center gap-2 sm:hidden">
								<Badge variant="secondary" className="capitalize">
									{member.role}
								</Badge>
								<MemberSheet
									member={member}
									data={data}
									groupId={groupId}
									run={run}
									canManage={canManage}
								/>
							</div>

							<div className="hidden shrink-0 items-center gap-2 sm:flex">
								{canManage ? (
									<MemberWeight member={member} groupId={groupId} run={run} />
								) : null}
								{data.group.myRole === "owner" ? (
									<Select
										value={member.role}
										onValueChange={(role) =>
											run(
												{
													action: "member.role",
													input: {
														groupId,
														userId: member.userId,
														role: role as Role,
													},
												},
												"Role updated",
											)
										}
									>
										<SelectTrigger
											className="w-28 capitalize"
											aria-label={`Role for ${member.name}`}
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{ROLES.map((role) => (
													<SelectItem
														key={role}
														value={role}
														className="capitalize"
													>
														{role}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								) : (
									<Badge variant="secondary" className="capitalize">
										{member.role}
									</Badge>
								)}
								{canManage ? (
									member.userId !== data.user.id ? (
										<ConfirmDialog
											media={<UserMinus />}
											title={`Remove ${member.name}?`}
											description={`${member.name} loses access immediately. Their shares in expenses already recorded stay put, and you can invite them back with a new invitation.`}
											confirmLabel="Remove from group"
											onConfirm={() =>
												run(
													{
														action: "member.remove",
														input: { groupId, userId: member.userId },
													},
													"Member removed",
												)
											}
											trigger={
												<Button
													variant="ghost"
													size="icon-sm"
													className="text-muted-foreground hover:text-destructive"
													aria-label={`Remove ${member.name}`}
												>
													<UserMinus />
												</Button>
											}
										/>
									) : (
										// Keeps the columns lined up on your own row.
										<span className="size-8" aria-hidden="true" />
									)
								) : null}
							</div>
						</li>
					))}
				</ul>
			</section>

			{data.invitations.length > 0 ? (
				<section
					aria-labelledby="invitations-heading"
					className="flex flex-col gap-4"
				>
					<div className="flex flex-col gap-1">
						<h2 id="invitations-heading" className="text-base font-semibold">
							Pending invitations
						</h2>
						<p className="text-sm text-muted-foreground">
							They join as soon as they accept.
						</p>
					</div>
					<ul className="island-shell divide-y overflow-hidden rounded-2xl">
						{data.invitations.map((invite) => (
							<li
								key={invite.id}
								className="flex items-center gap-3 py-3 ps-5 pe-4 sm:ps-6"
							>
								<span className="min-w-0 flex-1 truncate text-sm font-medium">
									{invite.email}
								</span>
								<Badge variant="secondary" className="capitalize">
									{invite.role}
								</Badge>
								{canManage ? (
									<ConfirmDialog
										media={<UserMinus />}
										title="Revoke this invitation?"
										description={`${invite.email} will not be able to join through this invitation. You can invite them again any time.`}
										confirmLabel="Revoke invitation"
										onConfirm={() =>
											run(
												{
													action: "invitation.revoke",
													input: { invitationId: invite.id },
												},
												"Invitation revoked",
											)
										}
										trigger={
											<Button
												size="sm"
												variant="ghost"
												className="text-destructive"
											>
												Revoke
											</Button>
										}
									/>
								) : null}
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	);
}

/* ---------------------------------------------------------------- Activity */

function ActivityTab({ data, groupId }: { data: LoaderData; groupId: string }) {
	const queryClient = useQueryClient();
	const activity = useInfiniteQuery({
		...groupActivityInfiniteOptions(groupId),
		initialData: () => ({
			pages: [data.activities],
			pageParams: [undefined],
		}),
		initialDataUpdatedAt: () =>
			queryClient.getQueryState(groupPageQueryOptions(groupId).queryKey)
				?.dataUpdatedAt ?? Date.now(),
	});

	useEffect(() => {
		if (!activity.isFetchNextPageError) return;
		toast.error(
			activity.error instanceof Error
				? activity.error.message
				: "Could not load activity",
		);
	}, [activity.isFetchNextPageError, activity.error]);

	const names = new Map(
		data.group.members.map((member) => [member.userId, member.name]),
	);
	const nameOf = (userId: string) => names.get(userId) ?? "someone";
	const items = activity.data?.pages.flatMap((page) => page.items) ?? [];

	if (activity.isPending)
		return (
			<p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
				<Spinner />
				Loading activity…
			</p>
		);

	if (activity.isError && items.length === 0)
		return (
			<EmptyState
				icon={History}
				title="Activity didn't load"
				description={
					activity.error instanceof Error
						? activity.error.message
						: "Could not load activity."
				}
			/>
		);

	if (items.length === 0)
		return (
			<EmptyState
				icon={History}
				title="Nothing has happened yet"
				description="Every expense, payment and membership change shows up here."
			/>
		);

	return (
		<Card className="island-shell">
			<CardHeader>
				<CardTitle>Activity</CardTitle>
				<CardDescription>
					Newest changes first.
					{activity.isFetching && !activity.isFetchingNextPage
						? " Updating…"
						: ""}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ItemGroup>
					{items.map((item) => (
						<ActivityLine key={item.id} item={item} nameOf={nameOf} />
					))}
				</ItemGroup>
				{activity.hasNextPage ? (
					<Button
						variant="outline"
						className="mt-4 w-full"
						disabled={activity.isFetchingNextPage}
						onClick={() => {
							void activity.fetchNextPage();
						}}
					>
						{activity.isFetchingNextPage ? (
							<Spinner data-icon="inline-start" />
						) : null}
						{activity.isFetchingNextPage ? "Loading…" : "Load more"}
					</Button>
				) : null}
			</CardContent>
		</Card>
	);
}

/* ---------------------------------------------------------------- Settings */

/** Payloads are stored as JSON text; a malformed one should not take the page down. */
function parsePayload<T>(payload: unknown): Partial<T> {
	if (typeof payload !== "string") return (payload ?? {}) as Partial<T>;
	try {
		return JSON.parse(payload) as Partial<T>;
	} catch {
		return {};
	}
}

function formatWhen(value: Date | string) {
	return new Date(value).toLocaleString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

/**
 * Grouped by what a setting is for — the group itself, what runs on its own,
 * getting data out, and the irreversible actions last — so the page reads top
 * to bottom from everyday to rare.
 */
function SettingsTab({
	data,
	groupId,
	run,
	execute,
	onLeave,
}: {
	data: LoaderData;
	groupId: string;
	run: Run;
	execute: Execute;
	onLeave: () => void;
}) {
	const [groupName, setGroupName] = useState(data.group.name);
	const [confirmName, setConfirmName] = useState("");
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [rulePattern, setRulePattern] = useState("");
	const [ruleCategory, setRuleCategory] = useState("");
	const [reminderUser, setReminderUser] = useState(
		data.group.members.find((member) => member.userId !== data.user.id)
			?.userId ?? data.user.id,
	);
	const [reminderAt, setReminderAt] = useState("");
	const isMember = data.group.myRole === "member";
	const navigate = useNavigate();
	const [duplicating, setDuplicating] = useState(false);
	const archived = Boolean(data.group.archivedAt);
	const reportHref = (format: "csv" | "pdf") =>
		`/api/v1/groups/${groupId}/reports/expenses?format=${format}`;
	const names = new Map(
		data.group.members.map((member) => [member.userId, member.name]),
	);
	const pendingReminders = data.reminders.filter((job) => !job.completedAt);

	return (
		<div className="flex flex-col gap-10 sm:gap-12">
			<SettingsSection
				title="General"
				description="The basics everyone in the group sees."
			>
				<SettingsRow
					title="Group name"
					htmlFor="group-rename"
					description={
						isMember
							? "Only owners and admins can rename this group."
							: "Everyone in the group sees the new name."
					}
				>
					<form
						className="flex w-full gap-2 sm:w-80"
						onSubmit={(event) => {
							event.preventDefault();
							if (isMember || !groupName.trim()) return;
							if (groupName === data.group.name) return;
							void run(
								{
									action: "group.rename",
									input: { groupId, name: groupName },
								},
								"Group renamed",
							);
						}}
					>
						<Input
							id="group-rename"
							value={groupName}
							onChange={(event) => setGroupName(event.target.value)}
							disabled={isMember}
						/>
						<Button
							type="submit"
							variant="outline"
							disabled={
								isMember || !groupName.trim() || groupName === data.group.name
							}
						>
							Save
						</Button>
					</form>
				</SettingsRow>
				<SettingsRow
					title={archived ? "Archived" : "Archive"}
					description={
						archived
							? "This group is read-only. Unarchive it to add expenses again."
							: "Make the group read-only. Balances and history stay visible."
					}
				>
					<Button
						variant="outline"
						disabled={isMember}
						onClick={() =>
							run(
								{
									action: archived ? "group.unarchive" : "group.archive",
									input: { groupId },
								},
								archived ? "Group unarchived" : "Group archived",
							)
						}
					>
						{archived ? (
							<ArchiveRestore data-icon="inline-start" />
						) : (
							<Archive data-icon="inline-start" />
						)}
						{archived ? "Unarchive" : "Archive"}
					</Button>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection
				title="Automation"
				description="Rules and reminders Eventual runs for this group on its own. Recurring expenses live on the Expenses tab."
			>
				<SettingsRow
					layout="stacked"
					title="Category rules"
					description="New expenses whose description contains the phrase get the category automatically."
				>
					<div className="flex flex-col gap-4">
						{data.categoryRules.length > 0 ? (
							<ul className="divide-y rounded-xl border">
								{data.categoryRules.map((rule) => (
									<li
										key={rule.id}
										className="flex items-center gap-3 py-2 ps-4 pe-2 text-sm"
									>
										<span className="min-w-0 flex-1 truncate">
											<span className="text-muted-foreground">Contains </span>
											<span className="font-medium">“{rule.pattern}”</span>
											<ArrowRight
												className="mx-2 inline size-3.5 text-muted-foreground"
												aria-hidden="true"
											/>
											<span className="sr-only">sets category to </span>
											<Badge variant="secondary">{rule.category}</Badge>
										</span>
										{isMember ? null : (
											<Button
												size="icon-sm"
												variant="ghost"
												className="text-muted-foreground hover:text-destructive"
												aria-label={`Delete rule for “${rule.pattern}”`}
												onClick={() =>
													run(
														{
															action: "category.delete",
															input: { groupId, ruleId: rule.id },
														},
														"Category rule deleted",
													)
												}
											>
												<Trash2 />
											</Button>
										)}
									</li>
								))}
							</ul>
						) : null}
						{isMember ? (
							<p className="text-sm text-muted-foreground">
								Only owners and admins can add rules.
							</p>
						) : (
							<form
								className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
								onSubmit={async (event) => {
									event.preventDefault();
									if (!rulePattern.trim() || !ruleCategory.trim()) return;
									const ok = await run(
										{
											action: "category.create",
											input: {
												groupId,
												pattern: rulePattern,
												category: ruleCategory,
												priority: 0,
											},
										},
										"Category rule added",
									);
									if (ok) {
										setRulePattern("");
										setRuleCategory("");
									}
								}}
							>
								<Field className="gap-1.5">
									<FieldLabel htmlFor="category-pattern">
										Description contains
									</FieldLabel>
									<Input
										id="category-pattern"
										value={rulePattern}
										onChange={(event) => setRulePattern(event.target.value)}
										placeholder="coffee"
									/>
								</Field>
								<Field className="gap-1.5">
									<FieldLabel htmlFor="category-name">Category</FieldLabel>
									<Input
										id="category-name"
										value={ruleCategory}
										onChange={(event) => setRuleCategory(event.target.value)}
										placeholder="Food & drink"
									/>
								</Field>
								<Button
									type="submit"
									variant="outline"
									disabled={!rulePattern.trim() || !ruleCategory.trim()}
								>
									<Plus data-icon="inline-start" />
									Add rule
								</Button>
							</form>
						)}
					</div>
				</SettingsRow>

				<SettingsRow
					layout="stacked"
					title="Email reminders"
					description="Email someone a nudge about their balance at a time you choose. Failed sends are retried."
				>
					<div className="flex flex-col gap-4">
						{pendingReminders.length > 0 ? (
							<ul className="divide-y rounded-xl border">
								{pendingReminders.map((job) => {
									const payload = parsePayload<{ userId: string }>(job.payload);
									return (
										<li
											key={job.id}
											className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
										>
											<span className="truncate font-medium">
												{names.get(payload.userId ?? "") ?? "A member"}
											</span>
											<span className="shrink-0 text-muted-foreground">
												{formatWhen(job.dueAt)}
											</span>
										</li>
									);
								})}
							</ul>
						) : null}
						<form
							className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
							onSubmit={async (event) => {
								event.preventDefault();
								const dueAt = new Date(reminderAt);
								if (!reminderUser || Number.isNaN(dueAt.getTime())) return;
								if (
									await run(
										{
											action: "reminder.schedule",
											input: { groupId, userId: reminderUser, dueAt },
										},
										"Reminder scheduled",
									)
								)
									setReminderAt("");
							}}
						>
							<Field className="gap-1.5">
								<FieldLabel htmlFor="reminder-user">Remind</FieldLabel>
								<Select value={reminderUser} onValueChange={setReminderUser}>
									<SelectTrigger id="reminder-user" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{data.group.members.map((member) => (
												<SelectItem key={member.userId} value={member.userId}>
													{member.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field className="gap-1.5">
								<FieldLabel htmlFor="reminder-at">Send on</FieldLabel>
								<Input
									id="reminder-at"
									type="datetime-local"
									value={reminderAt}
									onChange={(event) => setReminderAt(event.target.value)}
								/>
							</Field>
							<Button
								type="submit"
								variant="outline"
								disabled={!reminderAt || !reminderUser}
							>
								Schedule
							</Button>
						</form>
					</div>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection
				title="Data"
				description="Take this group's records elsewhere, or start fresh with the same people."
			>
				<SettingsRow
					title="Expense report"
					description="Every expense in this group, as a spreadsheet or a printable PDF."
				>
					<Button variant="outline" asChild>
						<a href={reportHref("csv")} download>
							<Download data-icon="inline-start" />
							CSV
						</a>
					</Button>
					<Button variant="outline" asChild>
						<a href={reportHref("pdf")} download>
							<Download data-icon="inline-start" />
							PDF
						</a>
					</Button>
				</SettingsRow>
				<SettingsRow
					title="Duplicate group"
					description={
						isMember
							? "Only owners and admins can duplicate this group."
							: "An empty copy with the same members, roles and weights."
					}
				>
					<Button
						variant="outline"
						disabled={isMember || duplicating}
						onClick={async () => {
							setDuplicating(true);
							const outcome = await execute({
								action: "group.duplicate",
								input: { groupId },
							});
							setDuplicating(false);
							if (
								!outcome.ok ||
								!outcome.result ||
								typeof outcome.result !== "object" ||
								!("id" in outcome.result) ||
								typeof outcome.result.id !== "string"
							)
								return;
							toast.success("Group duplicated");
							await navigate({
								to: "/app/groups/$groupId",
								params: { groupId: outcome.result.id },
							});
						}}
					>
						{duplicating ? (
							<Spinner data-icon="inline-start" />
						) : (
							<Copy data-icon="inline-start" />
						)}
						{duplicating ? "Duplicating…" : "Duplicate"}
					</Button>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection
				title="Danger zone"
				tone="danger"
				description="These can't be undone from here."
			>
				<SettingsRow
					title="Leave group"
					description="You can leave once your balance is zero and none of your shares are unpaid."
				>
					<ConfirmDialog
						media={<LogOut />}
						title={`Leave “${data.group.name}”?`}
						description="You'll lose access immediately. You'll need to be invited back to rejoin, and your balances with the group stay put."
						confirmLabel="Leave group"
						onConfirm={async () => {
							const ok = await run(
								{ action: "group.leave", input: { groupId } },
								"You left the group",
							);
							if (ok) onLeave();
							return ok;
						}}
						trigger={
							<Button variant="outline" className="text-destructive">
								<LogOut data-icon="inline-start" />
								Leave
							</Button>
						}
					/>
				</SettingsRow>
				{data.group.myRole === "owner" ? (
					<SettingsRow
						title="Delete group"
						description={`Permanently removes every expense, settlement and activity record for all ${data.group.members.length} ${
							data.group.members.length === 1 ? "member" : "members"
						}.`}
					>
						<Dialog
							open={deleteOpen}
							onOpenChange={(open) => {
								setDeleteOpen(open);
								if (!open) setConfirmName("");
							}}
						>
							<DialogTrigger asChild>
								<Button variant="destructive">
									<Trash2 data-icon="inline-start" />
									Delete
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Delete “{data.group.name}”?</DialogTitle>
									<DialogDescription>
										Type the group name to confirm. This deletes all of its
										expenses and settlements for everyone.
									</DialogDescription>
								</DialogHeader>
								<Field>
									<FieldLabel htmlFor="confirm-name">Group name</FieldLabel>
									<Input
										id="confirm-name"
										value={confirmName}
										autoComplete="off"
										placeholder={data.group.name}
										onChange={(event) => setConfirmName(event.target.value)}
									/>
								</Field>
								<DialogFooter>
									<Button
										variant="destructive"
										disabled={confirmName !== data.group.name}
										onClick={async () => {
											await run(
												{ action: "group.delete", input: { groupId } },
												"Group deleted",
											);
											setDeleteOpen(false);
											onLeave();
										}}
									>
										Delete permanently
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</SettingsRow>
				) : null}
			</SettingsSection>
		</div>
	);
}
