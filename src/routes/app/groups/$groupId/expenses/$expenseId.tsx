import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { Lock, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Amount } from "#/components/amount";
import { AppBreadcrumb } from "#/components/app-breadcrumb";
import { ExpenseEditor } from "#/components/expense-editor";
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
import { formatMinor } from "#/lib/money";
import { getExpenseFn, getGroupPageFn, mutateFn } from "#/server/fn/app";

export const Route = createFileRoute(
	"/app/groups/$groupId/expenses/$expenseId",
)({
	loader: async ({ params }) => ({
		expense: await getExpenseFn({ data: { expenseId: params.expenseId } }),
		page: await getGroupPageFn({ data: { groupId: params.groupId } }),
	}),
	component: ExpenseDetail,
});

const methodLabel = {
	even: "Split evenly",
	exact: "Exact amounts",
	shares: "By shares",
	percent: "By percentage",
} as const;

function ExpenseDetail() {
	const { expense, page } = Route.useLoaderData();
	const { groupId } = Route.useParams();
	const router = useRouter();
	const navigate = useNavigate();
	const [deleteOpen, setDeleteOpen] = useState(false);

	async function toggle(userId: string, paid: boolean) {
		try {
			await mutateFn({
				data: {
					action: "share.paid",
					input: { expenseId: expense.id, userId, paid },
				},
			});
			toast.success(paid ? "Share marked paid" : "Share marked unpaid");
			await router.invalidate();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not update");
		}
	}

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-5">
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
					<CardTitle className="display-title text-4xl font-bold">
						{expense.description}
					</CardTitle>
					<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
						<span className="text-2xl font-bold text-foreground">
							<Amount minor={expense.amountMinor} />
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
							return (
								<Item key={share.id} size="sm">
									<ItemMedia>
										<MemberAvatar name={share.user.name} seed={share.userId} />
									</ItemMedia>
									<ItemContent>
										<ItemTitle>
											{share.user.name}
											{share.userId === page.user.id ? (
												<span className="text-muted-foreground"> (you)</span>
											) : null}
										</ItemTitle>
										<ItemDescription>
											{paid && share.paidAt
												? `Paid on ${new Date(share.paidAt).toLocaleDateString(
														"en-IN",
														{ day: "numeric", month: "short" },
													)}`
												: "Unpaid"}
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<span className="font-semibold">
											<Amount minor={share.amountMinor} />
										</span>
										<Field orientation="horizontal" className="w-auto">
											<Checkbox
												id={`paid-${share.id}`}
												checked={paid}
												aria-label={`Mark ${share.user.name}'s share paid`}
												disabled={!canToggle}
												onCheckedChange={(checked) =>
													toggle(share.userId, checked === true)
												}
											/>
											<FieldLabel
												htmlFor={`paid-${share.id}`}
												className="font-normal"
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
					<Card className="island-shell">
						<CardHeader>
							<CardTitle>Edit expense</CardTitle>
							<CardDescription>
								Changing the amount or split recalculates every share.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ExpenseEditor
								groupId={groupId}
								members={page.group.members}
								currentUserId={page.user.id}
								initial={expense}
							/>
						</CardContent>
					</Card>

					<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
						<DialogTrigger asChild>
							<Button variant="outline" className="w-fit text-destructive">
								<Trash2 data-icon="inline-start" />
								Delete expense
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Delete this expense?</DialogTitle>
								<DialogDescription>
									“{expense.description}” for {formatMinor(expense.amountMinor)}{" "}
									will be removed for everyone, along with its shares.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<Button
									variant="destructive"
									onClick={async () => {
										try {
											await mutateFn({
												data: {
													action: "expense.delete",
													input: { expenseId: expense.id },
												},
											});
											toast.success("Expense deleted");
											await navigate({
												to: "/app/groups/$groupId",
												params: { groupId },
											});
										} catch (error) {
											toast.error(
												error instanceof Error
													? error.message
													: "Could not delete",
											);
										}
									}}
								>
									Delete expense
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</>
			)}
		</div>
	);
}
