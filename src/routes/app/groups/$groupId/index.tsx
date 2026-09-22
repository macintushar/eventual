import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import {
	ArrowRight,
	Check,
	ChevronRight,
	Copy,
	History,
	Lock,
	LogOut,
	MoreHorizontal,
	Plus,
	Receipt,
	Trash2,
	UserMinus,
	UserPlus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ActivityLine } from "#/components/activity-line";
import { Amount } from "#/components/amount";
import { AppBreadcrumb } from "#/components/app-breadcrumb";
import { BalanceBar } from "#/components/balance-bar";
import { useComposer } from "#/components/composer";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { CurrencySelect } from "#/components/currency-select";
import { EmptyState } from "#/components/empty-state";
import { MemberAvatar } from "#/components/member-avatar";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
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
	ItemMedia,
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
import { copyToClipboard } from "#/lib/clipboard";
import { currencySymbol } from "#/lib/currencies";
import { formatShortDate } from "#/lib/dates";
import { formatMinor, fromMinor, parseMinor } from "#/lib/money";
import { repaymentLimit, validateRepayment } from "#/lib/settlements";
import { getActivityFn, getGroupPageFn, mutateFn } from "#/server/fn/app";

export const Route = createFileRoute("/app/groups/$groupId/")({
	loader: ({ params }) => getGroupPageFn({ data: { groupId: params.groupId } }),
	component: GroupPage,
});

const ROLES = ["owner", "admin", "member"] as const;
type Role = (typeof ROLES)[number];

type LoaderData = Awaited<ReturnType<typeof getGroupPageFn>>;
type Run = (
	action: Parameters<typeof mutateFn>[0]["data"],
	message: string,
) => Promise<boolean>;

function GroupPage() {
	const data = Route.useLoaderData();
	const { groupId } = Route.useParams();
	const router = useRouter();
	const navigate = useNavigate();
	const composer = useComposer();

	const run: Run = async (action, message) => {
		try {
			await mutateFn({ data: action });
			toast.success(message);
			await router.invalidate();
			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Action failed");
			return false;
		}
	};

	const mine = data.balances.members.filter(
		(row) => row.userId === data.user.id,
	);

	return (
		<div className="flex flex-col gap-5 sm:gap-6">
			<AppBreadcrumb
				parent={{ label: "All groups", to: "/app" }}
				page={data.group.name}
			/>
			<header className="rise-in flex flex-wrap items-end justify-between gap-4">
				<div className="min-w-0">
					<p className="island-kicker capitalize">{data.group.myRole}</p>
					<h1 className="display-title text-[2.125rem] font-bold sm:text-5xl">
						{data.group.name}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
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
					className="segmented rail h-auto w-full justify-start p-1 [&>*]:shrink-0"
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

				<TabsContent value="expenses" className="mt-5">
					<ExpensesTab data={data} groupId={groupId} />
				</TabsContent>
				<TabsContent value="balances" className="mt-5">
					<BalancesTab data={data} groupId={groupId} run={run} />
				</TabsContent>
				<TabsContent value="members" className="mt-5">
					<MembersTab data={data} groupId={groupId} run={run} />
				</TabsContent>
				<TabsContent value="activity" className="mt-5">
					<ActivityTab data={data} groupId={groupId} />
				</TabsContent>
				<TabsContent value="settings" className="mt-5">
					<SettingsTab
						data={data}
						groupId={groupId}
						run={run}
						onLeave={() => navigate({ to: "/app" })}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}

/* ---------------------------------------------------------------- Expenses */

function ExpensesTab({ data, groupId }: { data: LoaderData; groupId: string }) {
	const composer = useComposer();

	if (data.expenses.items.length === 0)
		return (
			<EmptyState
				icon={Receipt}
				title="No expenses yet"
				description="Add the first shared cost and Eventual works out who owes what in each currency."
				action={
					<Button onClick={() => composer.expense({ groupId })}>
						<Plus data-icon="inline-start" />
						Add expense
					</Button>
				}
			/>
		);

	return (
		<ItemGroup className="island-shell overflow-hidden rounded-2xl">
			{data.expenses.items.map((item, index) => (
				<Item
					key={item.id}
					asChild
					size="sm"
					/*
					 * `flex-nowrap` matters on a phone: the default wrap drops the
					 * amount onto its own line as soon as a description gets long,
					 * which breaks the column of figures the list is read down.
					 */
					className="press rise-in flex-nowrap rounded-none border-b-border/60 last:border-b-transparent"
					style={{ "--i": index } as React.CSSProperties}
				>
					<Link
						to="/app/groups/$groupId/expenses/$expenseId"
						params={{ groupId, expenseId: item.id }}
					>
						<ItemMedia>
							<MemberAvatar name={item.payer.name} seed={item.payer.id} />
						</ItemMedia>
						<ItemContent className="min-w-0">
							<ItemTitle className="w-full min-w-0">
								<span className="truncate">{item.description}</span>
								{item.locked ? (
									<Badge variant="secondary" className="shrink-0">
										<Lock data-icon="inline-start" />
										Locked
									</Badge>
								) : null}
							</ItemTitle>
							<ItemDescription className="line-clamp-1">
								Paid by {item.payer.name} · {formatShortDate(item.date)}
							</ItemDescription>
						</ItemContent>
						<ItemActions className="shrink-0">
							<span className="font-bold sm:text-lg">
								<Amount minor={item.amountMinor} currency={item.currency} />
							</span>
							<ChevronRight
								className="size-4 text-muted-foreground"
								aria-hidden="true"
							/>
						</ItemActions>
					</Link>
				</Item>
			))}
		</ItemGroup>
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
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{data.balances.transfers.length === 0 ? (
							<Alert className="border-positive/30 bg-positive/10 text-positive">
								<AlertTitle>Everyone is settled up.</AlertTitle>
							</Alert>
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
													Settle up
												</Button>
											) : null}
										</ItemActions>
									</Item>
								))}
							</ItemGroup>
						)}

						<Dialog open={settleOpen} onOpenChange={setSettleOpen}>
							<DialogTrigger asChild>
								<Button variant="outline" className="mt-1">
									Record settlement
								</Button>
							</DialogTrigger>
							<DialogContent
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
						<CardTitle className="flex items-center gap-2">
							<History />
							Settlement history
						</CardTitle>
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

function MembersTab({
	data,
	groupId,
	run,
}: {
	data: LoaderData;
	groupId: string;
	run: Run;
}) {
	const router = useRouter();
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<"owner" | "admin" | "member">(
		"member",
	);
	const [inviteUrl, setInviteUrl] = useState("");
	const [copied, setCopied] = useState(false);
	const canManage = data.group.myRole !== "member";

	return (
		<Card className="island-shell">
			<CardHeader className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<CardTitle>Members</CardTitle>
					<CardDescription>
						Owners manage roles; admins manage members.
					</CardDescription>
				</div>
				{canManage && (
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
									Eventual doesn't send email — create a link and share it
									yourself.
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
									disabled={!inviteEmail.trim()}
									onClick={async () => {
										try {
											const result = await mutateFn({
												data: {
													action: "invitation.create",
													input: {
														groupId,
														email: inviteEmail,
														role: inviteRole,
													},
												},
											});
											if (result && "inviteUrl" in result)
												setInviteUrl(
													`${window.location.origin}${result.inviteUrl}`,
												);
											if (result && "emailDelivery" in result) {
												if (result.emailDelivery === "scheduled")
													toast.success("Invitation email queued");
											}
											setCopied(false);
											await router.invalidate();
										} catch (error) {
											toast.error(
												error instanceof Error
													? error.message
													: "Invite failed",
											);
										}
									}}
								>
									Send invitation
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
														aria-label={copied ? "Copied" : "Copy invite link"}
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
				)}
			</CardHeader>
			<CardContent>
				<ItemGroup>
					{data.group.members.map((member) => (
						<Item key={member.userId} size="sm" className="flex-nowrap">
							<ItemMedia>
								<MemberAvatar name={member.name} seed={member.userId} />
							</ItemMedia>
							<ItemContent className="min-w-0">
								<ItemTitle className="w-full min-w-0">
									<span className="truncate">
										{member.name}
										{member.userId === data.user.id ? (
											<span className="text-muted-foreground"> (you)</span>
										) : null}
									</span>
								</ItemTitle>
								<ItemDescription className="line-clamp-1">
									{member.email}
								</ItemDescription>
							</ItemContent>

							{/* Phone: the role reads as a badge and everything you can do
							    to this person is one tap away in a sheet. */}
							<ItemActions className="shrink-0 sm:hidden">
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
							</ItemActions>

							<ItemActions className="hidden shrink-0 sm:flex">
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
											className="w-32 capitalize"
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
								{member.userId !== data.user.id && canManage ? (
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
												size="sm"
												className="press text-destructive"
											>
												Remove
											</Button>
										}
									/>
								) : null}
							</ItemActions>
						</Item>
					))}
				</ItemGroup>

				{data.invitations.length > 0 ? (
					<>
						<Separator className="my-4" />
						<p className="mb-2 text-sm font-semibold">Pending invitations</p>
						<ItemGroup className="gap-2">
							{data.invitations.map((invite) => (
								<Item key={invite.id} variant="outline" size="sm">
									<ItemContent>
										<ItemTitle>
											{invite.email}
											<Badge variant="secondary" className="capitalize">
												{invite.role}
											</Badge>
										</ItemTitle>
									</ItemContent>
									<ItemActions>
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
													className="press text-destructive"
												>
													Revoke
												</Button>
											}
										/>
									</ItemActions>
								</Item>
							))}
						</ItemGroup>
					</>
				) : null}
			</CardContent>
		</Card>
	);
}

/* ---------------------------------------------------------------- Activity */

function ActivityTab({ data, groupId }: { data: LoaderData; groupId: string }) {
	const [items, setItems] = useState(data.activities.items);
	const [cursor, setCursor] = useState(data.activities.nextCursor);
	const [loading, setLoading] = useState(false);

	const names = new Map(
		data.group.members.map((member) => [member.userId, member.name]),
	);
	const nameOf = (userId: string) => names.get(userId) ?? "someone";

	const loadMore = async () => {
		if (!cursor) return;
		setLoading(true);
		try {
			const next = await getActivityFn({ data: { groupId, cursor } });
			setItems((old) => [...old, ...next.items]);
			setCursor(next.nextCursor);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not load activity",
			);
		} finally {
			setLoading(false);
		}
	};

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
				<CardDescription>Newest changes first.</CardDescription>
			</CardHeader>
			<CardContent>
				<ItemGroup>
					{items.map((item) => (
						<ActivityLine key={item.id} item={item} nameOf={nameOf} />
					))}
				</ItemGroup>
				{cursor ? (
					<Button
						variant="outline"
						className="mt-4 w-full"
						disabled={loading}
						onClick={loadMore}
					>
						{loading ? <Spinner data-icon="inline-start" /> : null}
						{loading ? "Loading…" : "Load more"}
					</Button>
				) : null}
			</CardContent>
		</Card>
	);
}

/* ---------------------------------------------------------------- Settings */

function SettingsTab({
	data,
	groupId,
	run,
	onLeave,
}: {
	data: LoaderData;
	groupId: string;
	run: Run;
	onLeave: () => void;
}) {
	const [groupName, setGroupName] = useState(data.group.name);
	const [confirmName, setConfirmName] = useState("");
	const [deleteOpen, setDeleteOpen] = useState(false);
	const isMember = data.group.myRole === "member";

	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<Card className="island-shell">
				<CardHeader>
					<CardTitle>Rename group</CardTitle>
					<CardDescription>
						{isMember
							? "Only owners and admins can rename this group."
							: "Everyone in the group sees the new name."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup className="flex-row items-end gap-2">
						<Field className="flex-1">
							<FieldLabel htmlFor="group-rename" className="sr-only">
								Group name
							</FieldLabel>
							<Input
								id="group-rename"
								aria-label="Group name"
								value={groupName}
								onChange={(event) => setGroupName(event.target.value)}
								disabled={isMember}
							/>
						</Field>
						<Button
							disabled={
								isMember || !groupName.trim() || groupName === data.group.name
							}
							onClick={() =>
								run(
									{
										action: "group.rename",
										input: { groupId, name: groupName },
									},
									"Group renamed",
								)
							}
						>
							Save
						</Button>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card className="island-shell">
				<CardHeader>
					<CardTitle>Leave group</CardTitle>
					<CardDescription>
						You can only leave once your balance is zero and no share of yours
						is still unpaid.
					</CardDescription>
				</CardHeader>
				<CardContent>
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
							<Button variant="outline" className="press text-destructive">
								Leave group
							</Button>
						}
					/>
				</CardContent>
			</Card>

			{data.group.myRole === "owner" && (
				<Card className="island-shell border-destructive/30 lg:col-span-2">
					<CardHeader>
						<CardTitle className="text-destructive">Delete group</CardTitle>
						<CardDescription>
							Permanently removes every expense, settlement and activity record
							for all {data.group.members.length} members. This cannot be
							undone.
						</CardDescription>
					</CardHeader>
					<CardContent>
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
									Delete group
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
					</CardContent>
				</Card>
			)}
		</div>
	);
}
