import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import { Plus, Receipt, Repeat, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useComposer } from "#/components/composer";
import { EmptyState } from "#/components/empty-state";
import { ExpenseTable } from "#/components/expense-table";
import { HistoryContinuation } from "#/components/history-continuation";
import {
	NewRecurringExpense,
	RecurringExpenses,
} from "#/components/recurring-expenses";
import { Button } from "#/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "#/components/ui/input-group";
import { Spinner } from "#/components/ui/spinner";
import { expensesInfiniteOptions, recurringQueryOptions } from "#/lib/queries";
import { cn } from "#/lib/utils";
import type { ExpenseSortBy } from "#/server/schemas/expenses";
import { LoadError, type LoaderData, Loading, type Run } from "./shared";

/* ---------------------------------------------------------------- Expenses */

export function ExpensesTab({
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
	const [sort, setSort] = useState<{ id: ExpenseSortBy; desc: boolean }>({
		id: "date",
		desc: true,
	});
	const searching = submitted.length > 0;
	const expenseQuery = useInfiniteQuery({
		...expensesInfiniteOptions(
			groupId,
			submitted,
			sort.id,
			sort.desc ? "desc" : "asc",
		),
		// A new search or sort keeps the current rows on screen, dimmed, until
		// the answer arrives; the spinner in the search box says it's working.
		placeholderData: keepPreviousData,
	});
	const recurringQuery = useQuery(recurringQueryOptions(groupId));
	const recurringExpenses = recurringQuery.data ?? [];
	const items = expenseQuery.data?.pages.flatMap((page) => page.items) ?? [];

	// Until the list has loaded, don't offer to set one up: a schedule may
	// already exist, and a second one would double-charge the group.
	const hasRecurring =
		!recurringQuery.isSuccess || recurringExpenses.length > 0;
	const recurring = recurringQuery.isError ? (
		<LoadError
			title="Couldn't load recurring expenses"
			query={recurringQuery}
		/>
	) : (
		<RecurringExpenses
			groupId={groupId}
			templates={recurringExpenses}
			members={data.group.members}
			currentUserId={data.user.id}
			myRole={data.group.myRole}
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

	if (
		expenseQuery.isSuccess &&
		!expenseQuery.isPlaceholderData &&
		items.length === 0 &&
		!searching
	)
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

	const waiting = expenseQuery.isPending;
	// Only a failed first page replaces the list; a failed next page is the
	// continuation's to report, under the rows that did load.
	const failed = expenseQuery.isError && items.length === 0;

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
				{failed ? (
					<LoadError
						icon={Receipt}
						title="Couldn't load expenses"
						query={expenseQuery}
					/>
				) : waiting ? (
					<Loading label="Loading expenses…" />
				) : items.length === 0 ? (
					<p
						className={cn(
							"py-8 text-center text-sm text-muted-foreground transition-opacity",
							expenseQuery.isPlaceholderData && "opacity-60",
						)}
						aria-busy={expenseQuery.isPlaceholderData}
					>
						No expenses match this search.
					</p>
				) : (
					<div className="island-shell overflow-hidden rounded-2xl">
						<ExpenseTable
							rows={items}
							members={data.group.members}
							groupId={groupId}
							fetching={
								expenseQuery.isFetching && !expenseQuery.isFetchingNextPage
							}
							sort={sort}
							onSortChange={(next) => {
								setSort(next);
							}}
						/>
					</div>
				)}
				{failed ? null : (
					<HistoryContinuation query={expenseQuery} label="expenses" />
				)}
			</section>
		</div>
	);
}
