import { Link } from "@tanstack/react-router";
import {
	createColumnHelper,
	rowSortingFeature,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Lock } from "lucide-react";
import { useMemo } from "react";

import { Amount } from "#/components/amount";
import { MemberAvatar } from "#/components/member-avatar";
import { Badge } from "#/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { formatShortDate } from "#/lib/dates";
import { cn } from "#/lib/utils";
import type { ExpenseSortBy } from "#/server/schemas/expenses";

export type ExpenseTableRow = {
	id: string;
	description: string;
	date: Date | string | number;
	category?: string | null;
	amountMinor: number;
	currency: string;
	locked: boolean;
	payer: { id: string; name: string };
};

const features = tableFeatures({ rowSortingFeature });

const helper = createColumnHelper<typeof features, ExpenseTableRow>();
const EMPTY_ROWS: ExpenseTableRow[] = [];

function SortMark({ sorted }: { sorted: false | "asc" | "desc" }) {
	if (sorted === "asc") return <ArrowUp className="size-3.5" aria-hidden />;
	if (sorted === "desc") return <ArrowDown className="size-3.5" aria-hidden />;
	return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />;
}

export function ExpenseTable({
	rows,
	groupId,
	fetching = false,
	sort,
	onSortChange,
}: {
	rows: ExpenseTableRow[];
	groupId: string;
	fetching?: boolean;
	sort: { id: ExpenseSortBy; desc: boolean };
	onSortChange: (sort: { id: ExpenseSortBy; desc: boolean }) => void;
}) {
	const columns = useMemo(
		() =>
			helper.columns([
				helper.accessor("description", {
					header: "Description",
					sortDescFirst: false,
					cell: (info) => {
						const expense = info.row.original;
						return (
							<Link
								to="/app/groups/$groupId/expenses/$expenseId"
								params={{ groupId, expenseId: expense.id }}
								className="flex min-w-0 items-center gap-2 rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
							>
								<span className="truncate font-medium">
									{expense.description}
								</span>
								{expense.locked ? (
									<Badge variant="secondary" className="shrink-0">
										<Lock data-icon="inline-start" />
										Locked
									</Badge>
								) : null}
							</Link>
						);
					},
				}),
				helper.accessor((row) => row.payer.name, {
					id: "payer",
					header: "Paid by",
					sortDescFirst: false,
					cell: (info) => (
						<span className="flex items-center gap-2">
							<MemberAvatar
								name={info.row.original.payer.name}
								seed={info.row.original.payer.id}
								className="size-6 text-[9px]"
							/>
							<span className="truncate">{info.getValue()}</span>
						</span>
					),
				}),
				helper.accessor((row) => new Date(row.date).getTime(), {
					id: "date",
					header: "Date",
					sortDescFirst: true,
					cell: (info) => formatShortDate(info.row.original.date),
				}),
				helper.accessor((row) => row.category ?? undefined, {
					id: "category",
					header: "Category",
					sortDescFirst: false,
					cell: (info) => info.getValue() || "—",
				}),
				helper.accessor("amountMinor", {
					header: "Amount",
					sortDescFirst: true,
					cell: (info) => (
						<Amount
							minor={info.getValue()}
							currency={info.row.original.currency}
						/>
					),
				}),
			]),
		[groupId],
	);
	const data = rows.length ? rows : EMPTY_ROWS;
	const table = useTable({
		features,
		columns,
		data,
		getRowId: (row) => row.id,
		manualSorting: true,
		enableSortingRemoval: false,
		enableMultiSort: false,
		state: { sorting: [sort] },
		onSortingChange: (updater) => {
			const next = typeof updater === "function" ? updater([sort]) : updater;
			if (next[0])
				onSortChange({ id: next[0].id as ExpenseSortBy, desc: next[0].desc });
		},
	});

	return (
		<Table className={cn(fetching && "opacity-60")} aria-busy={fetching}>
			<TableHeader>
				{table.getHeaderGroups().map((group) => (
					<TableRow key={group.id} className="hover:bg-transparent">
						{group.headers.map((header) => {
							const sorted = header.column.getIsSorted();
							return (
								<TableHead
									key={header.id}
									aria-sort={
										sorted === "asc"
											? "ascending"
											: sorted === "desc"
												? "descending"
												: undefined
									}
									className={
										header.column.id === "amountMinor"
											? "text-right"
											: undefined
									}
								>
									{header.isPlaceholder ? null : (
										<button
											type="button"
											className={cn(
												"inline-flex items-center gap-1",
												header.column.id === "amountMinor" && "ml-auto",
											)}
											onClick={header.column.getToggleSortingHandler()}
										>
											<table.FlexRender header={header} />
											<SortMark sorted={sorted} />
											<span className="sr-only">
												{sorted === "asc"
													? ", sorted ascending"
													: sorted === "desc"
														? ", sorted descending"
														: ", not sorted"}
											</span>
										</button>
									)}
								</TableHead>
							);
						})}
					</TableRow>
				))}
			</TableHeader>
			<TableBody>
				{table.getRowModel().rows.map((row) => (
					<TableRow key={row.id}>
						{row.getAllCells().map((cell) => (
							<TableCell
								key={cell.id}
								className={cn(
									cell.column.id === "amountMinor" && "text-right font-bold",
									cell.column.id === "description" && "max-w-64",
								)}
							>
								<table.FlexRender cell={cell} />
							</TableCell>
						))}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
