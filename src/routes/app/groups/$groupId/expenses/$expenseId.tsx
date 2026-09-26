import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { Amount } from "#/components/amount";
import { AppBreadcrumb } from "#/components/app-breadcrumb";
import { ExpenseComposer } from "#/components/expense-composer";
import { MemberAvatar } from "#/components/member-avatar";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Field, FieldLabel } from "#/components/ui/field";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "#/components/ui/item";
import { Separator } from "#/components/ui/separator";
import { Spinner } from "#/components/ui/spinner";
import { useAppMutation } from "#/lib/app-mutation";
import { formatMinor } from "#/lib/money";
import { expenseQueryOptions, groupPageQueryOptions } from "#/lib/queries";
import { validateSharePayment } from "#/lib/settlements";
import { isApiNotFound } from "#/lib/web-api-client";

export const Route = createFileRoute(
	"/app/groups/$groupId/expenses/$expenseId",
)({
	loader: async ({ context, params }) => {
		try {
			await Promise.all([
				context.queryClient.ensureQueryData(
					expenseQueryOptions(params.expenseId),
				),
				context.queryClient.ensureQueryData(
					groupPageQueryOptions(params.groupId),
				),
			]);
		} catch (error) {
			if (isApiNotFound(error)) throw notFound();
			throw error;
		}
	},
	component: ExpenseDetail,
});

const methodLabel = {
	even: "Split evenly",
	exact: "Exact amounts",
	shares: "By shares",
	percent: "By percentage",
} as const;

function ExpenseDetail() {
	const { groupId, expenseId } = Route.useParams();
	const { data: expense, isFetching } = useSuspenseQuery(
		expenseQueryOptions(expenseId),
	);
	const { data: page } = useSuspenseQuery(groupPageQueryOptions(groupId));
	const navigate = useNavigate();
	const { run, isPending } = useAppMutation();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	// Every open starts from the expense as it stands, not from whatever the last
	// abandoned edit left behind.
	const [editToken, setEditToken] = useState(0);

	async function toggle(userId: string, paid: boolean) {
		await run(
			{
				action: "share.paid",
				input: { expenseId: expense.id, userId, paid },
			},
			paid ? "Share marked paid" : "Share marked unpaid",
		);
	}

	return (
		<div className="col-form flex flex-col gap-5">
			<AppBreadcrumb
				parent={{
					label: page.group.name,
					to: "/app/groups/$groupId",
					params: { groupId },
				}}
				page={expense.description}
			/>

			<Card className="island-shell">
				<CardHeader>
					<CardDescription className="island-kicker">
						{methodLabel[expense.splitMethod]}
					</CardDescription>
					<CardTitle className="display-title flex flex-wrap items-center gap-3 text-[2.125rem] font-bold sm:text-4xl">
						{expense.description}
						{isFetching || isPending ? (
							<span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
								<Spinner className="size-3" />
								{isPending ? "Saving" : "Updating"}
							</span>
						) : null}
					</CardTitle>
					<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
						<span className="text-2xl font-bold text-foreground">
							<Amount minor={expense.amountMinor} currency={expense.currency} />
						</span>
						<span>· paid by {expense.payer.name}</span>
						<span>
							·{" "}
							{new Date(expense.date).toLocaleDateString("en-IN", {
								day: "numeric",
								month: "long",
								year: "numeric",
							})}
						</span>
					</p>
				</CardHeader>
				{expense.notes ? (
					<CardContent>
						<Separator className="mb-3" />
						<p className="text-sm text-muted-foreground">{expense.notes}</p>
					</CardContent>
				) : null}
			</Card>

			{expense.locked && (
				<Alert className="border-warning/40 bg-warning/10 text-warning [&>svg]:text-warning">
					<Lock aria-hidden="true" />
					<AlertTitle className="font-semibold">Locked</AlertTitle>
					<AlertDescription className="text-warning/90">
						{expense.lockedBy
							.map(
								(row) =>
									`${row.name} marked their share paid on ${
										row.paidAt
											? new Date(row.paidAt).toLocaleDateString("en-IN", {
													day: "numeric",
													month: "short",
												})
											: "an unknown date"
									}`,
							)
							.join(" · ")}
						. Unmark every paid share before this expense can be edited or
						deleted.
					</AlertDescription>
				</Alert>
			)}

			<Card className="island-shell">
				<CardHeader>
					<CardTitle>Shares</CardTitle>
					<CardDescription>
						A share can be toggled by the person who owes it, or by the payer.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ItemGroup>
						{expense.shares.map((share) => {
							const canToggle =
								page.user.id === share.userId ||
								page.user.id === expense.paidByUserId;
							const paid = share.paidAt !== null;
							const invalid = validateSharePayment(page.balances.transfers, {
								fromUserId: share.userId,
								toUserId: expense.paidByUserId,
								currency: expense.currency,
								amountMinor: share.amountMinor,
								paid: !paid,
								hasAllocations: share.allocations.length > 0,
							});
							return (
								/*
								 * `flex-nowrap` keeps the amount and its checkbox on the
								 * member's line; wrapping put a long name, its status and
								 * its figure on three separate rows at phone width.
								 */
								<Item key={share.id} size="sm" className="flex-nowrap">
									<ItemMedia>
										<MemberAvatar name={share.user.name} seed={share.userId} />
									</ItemMedia>
									<ItemContent className="min-w-0">
										<ItemTitle className="w-full min-w-0">
											<span className="truncate">
												{share.user.name}
												{share.userId === page.user.id ? (
													<span className="text-muted-foreground"> (you)</span>
												) : null}
											</span>
										</ItemTitle>
										<ItemDescription>
											{paid && share.paidAt
												? `Paid on ${new Date(share.paidAt).toLocaleDateString(
														"en-IN",
														{ day: "numeric", month: "short" },
													)}`
												: "Unpaid"}
										</ItemDescription>
										{canToggle && invalid && (
											<ItemDescription className="line-clamp-none text-pretty">
												{invalid}
											</ItemDescription>
										)}
									</ItemContent>
									<ItemActions className="shrink-0">
										<span className="font-semibold">
											<Amount
												minor={share.amountMinor}
												currency={expense.currency}
											/>
										</span>
										<Field orientation="horizontal" className="w-auto">
											<Checkbox
												id={`paid-${share.id}`}
												checked={paid}
												aria-label={`Mark ${share.user.name}'s share paid`}
												disabled={!canToggle || Boolean(invalid)}
												onCheckedChange={(checked) =>
													toggle(share.userId, checked === true)
												}
											/>
											{/* The row already reads Paid/Unpaid underneath the
											    name, so the label only earns its width at `sm`. */}
											<FieldLabel
												htmlFor={`paid-${share.id}`}
												className="font-normal max-sm:sr-only"
											>
												Paid
											</FieldLabel>
										</Field>
									</ItemActions>
								</Item>
							);
						})}
					</ItemGroup>
				</CardContent>
			</Card>

			{!expense.locked && (
				<>
					{editOpen ? (
						<ExpenseComposer
							key={editToken}
							open
							onOpenChange={setEditOpen}
							groups={[
								{
									id: groupId,
									name: page.group.name,
									members: page.group.members,
								},
							]}
							currentUserId={page.user.id}
							defaultGroupId={groupId}
							initial={expense}
							onSaved={() => undefined}
						/>
					) : null}

					<div className="flex flex-wrap gap-2">
						<Button
							className="press"
							onClick={() => {
								setEditToken((old) => old + 1);
								setEditOpen(true);
							}}
						>
							<Pencil data-icon="inline-start" />
							Edit expense
						</Button>

						<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
							<DialogTrigger asChild>
								<Button variant="outline" className="press text-destructive">
									<Trash2 data-icon="inline-start" />
									Delete expense
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Delete this expense?</DialogTitle>
									<DialogDescription>
										“{expense.description}” for{" "}
										{formatMinor(expense.amountMinor, expense.currency)} will be
										removed for everyone, along with its shares.
									</DialogDescription>
								</DialogHeader>
								<DialogFooter>
									<Button
										variant="destructive"
										disabled={deleting}
										onClick={async () => {
											setDeleting(true);
											const deleted = await run(
												{
													action: "expense.delete",
													input: { expenseId: expense.id },
												},
												"Expense deleted",
											);
											if (!deleted) {
												setDeleting(false);
												return;
											}
											await navigate({
												to: "/app/groups/$groupId",
												params: { groupId },
											});
										}}
									>
										{deleting ? <Spinner data-icon="inline-start" /> : null}
										{deleting ? "Deleting…" : "Delete expense"}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
				</>
			)}
		</div>
	);
}
