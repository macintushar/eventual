import { createFileRoute } from "@tanstack/react-router";

import { AppBreadcrumb } from "#/components/app-breadcrumb";
import { ExpenseEditor } from "#/components/expense-editor";
import { getGroupPageFn } from "#/server/fn/app";

export const Route = createFileRoute("/app/groups/$groupId/expenses/new")({
	loader: ({ params }) => getGroupPageFn({ data: { groupId: params.groupId } }),
	component: NewExpense,
});

function NewExpense() {
	const data = Route.useLoaderData();
	return (
		<div className="flex flex-col gap-5">
			<AppBreadcrumb
				parent={{
					label: data.group.name,
					to: "/app/groups/$groupId",
					params: { groupId: data.group.id },
				}}
				page="New expense"
			/>
			<div>
				<p className="island-kicker">New expense</p>
				<h1 className="display-title text-4xl font-bold">Add an expense</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Splits are computed in paise, so shares always add up to the total
					exactly.
				</p>
			</div>
			<ExpenseEditor
				groupId={data.group.id}
				members={data.group.members}
				currentUserId={data.user.id}
			/>
		</div>
	);
}
