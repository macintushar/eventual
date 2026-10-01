import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { Amount } from "#/components/amount";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
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
import { Spinner } from "#/components/ui/spinner";
import type { useAppMutation } from "#/lib/app-mutation";
import { formatShortDate } from "#/lib/dates";
import { categoryBackfillQueryOptions } from "#/lib/queries";

type Change = {
	expenseId: string;
	currentCategory: string | null;
};

/**
 * Filling in a missing category is safe to suggest; replacing one someone
 * picked is not, so those start unticked unless a single rule was asked for.
 */
function defaultSelection(changes: readonly Change[], ruleId?: string) {
	return new Set(
		changes
			.filter(
				(change) =>
					ruleId ||
					!change.currentCategory ||
					change.currentCategory === "Other",
			)
			.map((change) => change.expenseId),
	);
}

/**
 * Every existing expense the group's rules would file differently, in one
 * list, so people can tick the ones to update instead of editing each expense.
 */
export function CategoryReviewDialog({
	groupId,
	ruleId,
	execute,
	trigger,
}: {
	groupId: string;
	/** Only the expenses this rule decides. */
	ruleId?: string;
	execute: ReturnType<typeof useAppMutation>["execute"];
	trigger: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<Set<string> | null>(null);
	const [saving, setSaving] = useState(false);
	const query = useQuery({
		...categoryBackfillQueryOptions(groupId, ruleId),
		enabled: open,
	});
	const changes = query.data?.changes ?? [];
	const chosen = selected ?? defaultSelection(changes, ruleId);
	const picked = changes.filter((change) => chosen.has(change.expenseId));
	const allPicked = changes.length > 0 && picked.length === changes.length;

	const toggle = (expenseId: string, on: boolean) => {
		const next = new Set(chosen);
		if (on) next.add(expenseId);
		else next.delete(expenseId);
		setSelected(next);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setSelected(null);
			}}
		>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			{/* A minmax track, or one long description widens the sheet past a phone. */}
			<DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Update expense categories</DialogTitle>
					<DialogDescription>
						{ruleId
							? "Existing expenses this rule would categorize differently."
							: "Existing expenses your rules and the built-in keywords would categorize differently. Expenses with a category already start unticked."}
					</DialogDescription>
				</DialogHeader>
				{query.isPending ? (
					<div className="flex justify-center py-10">
						<Spinner />
					</div>
				) : query.isError ? (
					<p className="py-6 text-sm text-destructive">
						Couldn't load suggestions. Close this and try again.
					</p>
				) : changes.length === 0 ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						Every expense already has the category the rules would give it.
					</p>
				) : (
					<div className="flex min-h-0 flex-col gap-2">
						<label
							htmlFor="category-review-all"
							className="flex items-center gap-3 px-3 text-sm font-medium"
						>
							<Checkbox
								id="category-review-all"
								checked={
									allPicked ? true : picked.length ? "indeterminate" : false
								}
								onCheckedChange={(value) =>
									setSelected(
										value === true
											? new Set(changes.map((change) => change.expenseId))
											: new Set(),
									)
								}
							/>
							Select all
							<span className="ms-auto font-normal text-muted-foreground tabular">
								{picked.length} of {changes.length} selected
							</span>
						</label>
						<ul className="max-h-[55vh] divide-y overflow-y-auto rounded-xl border">
							{changes.map((change) => (
								<li key={change.expenseId}>
									<label
										htmlFor={`category-review-${change.expenseId}`}
										className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-muted/50"
									>
										<Checkbox
											id={`category-review-${change.expenseId}`}
											className="mt-0.5"
											checked={chosen.has(change.expenseId)}
											onCheckedChange={(value) =>
												toggle(change.expenseId, value === true)
											}
										/>
										<span className="flex min-w-0 flex-1 flex-col gap-1">
											<span className="flex items-baseline gap-2">
												<span className="truncate font-medium">
													{change.description}
												</span>
												<Amount
													minor={change.amountMinor}
													currency={change.currency}
													className="ms-auto shrink-0 text-muted-foreground"
												/>
											</span>
											<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
												{formatShortDate(change.date)}
												<span aria-hidden="true">·</span>
												{change.currentCategory ? (
													<Badge variant="outline">
														{change.currentCategory}
													</Badge>
												) : (
													<span>No category</span>
												)}
												<ArrowRight className="size-3" aria-hidden="true" />
												<span className="sr-only">becomes</span>
												<Badge variant="secondary">{change.category}</Badge>
												{change.pattern ? (
													<span>matches “{change.pattern}”</span>
												) : null}
											</span>
										</span>
									</label>
								</li>
							))}
						</ul>
					</div>
				)}
				<DialogFooter>
					<Button
						disabled={!picked.length || saving}
						onClick={async () => {
							setSaving(true);
							const outcome = await execute({
								action: "category.apply",
								input: {
									groupId,
									changes: picked.map((change) => ({
										expenseId: change.expenseId,
										category: change.category,
									})),
								},
							});
							setSaving(false);
							if (!outcome.ok) return;
							const { updated } = outcome.result as { updated: number };
							toast.success(
								`${updated} ${updated === 1 ? "expense" : "expenses"} updated`,
							);
							setOpen(false);
							setSelected(null);
						}}
					>
						{saving ? <Spinner data-icon="inline-start" /> : null}
						Update {picked.length || ""}{" "}
						{picked.length === 1 ? "expense" : "expenses"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
