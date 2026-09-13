export type HelpArticle = {
	slug: "create-a-group" | "add-an-expense";
	title: string;
	kicker: string;
	lede: string;
	steps: { title: string; body: string; image: string; alt: string }[];
};

export const HELP_ARTICLES: HelpArticle[] = [
	{
		slug: "create-a-group",
		title: "How do I create a group?",
		kicker: "Groups",
		lede: "A group is a shared tab — a trip, a flat, a run of lunches. Name it, invite people if you like, then log costs as they happen.",
		steps: [
			{
				title: "Open New group",
				body: "From the dashboard, use the New group pill. On a phone, tap the plus in the dock and choose New group. Either one opens a short stepped dialog over the page you were on.",
				image: "/help/dashboard.png",
				alt: "The Eventual dashboard with a New group button next to the group list.",
			},
			{
				title: "Give it a name",
				body: "Type a name, or pick one of the suggestions. The group holds its own expenses, balances and members.",
				image: "/help/group-name.png",
				alt: "The Start a group dialog on the Name step, with Sunday dinner typed in.",
			},
			{
				title: "Invite people, or skip",
				body: "Add emails if you already know who belongs. You can leave this empty and invite later from the group's Members tab.",
				image: "/help/group-people.png",
				alt: "The People step with mac@eventual.test added as a member.",
			},
			{
				title: "Review and create",
				body: "Check the name and invites, then create the group. You become its owner and land on the empty group page, ready for the first expense.",
				image: "/help/group-review.png",
				alt: "The Review step showing Sunday dinner and one invited member.",
			},
		],
	},
	{
		slug: "add-an-expense",
		title: "How do I add an expense?",
		kicker: "Expenses",
		lede: "Open a group and add what was paid. Eventual splits it in that currency's smallest unit, so the shares always add up to the total.",
		steps: [
			{
				title: "Start from the group",
				body: "Open the group, then use Add expense — or the plus in the dock. If you are already in a group, the form skips ahead to the details.",
				image: "/help/group-empty.png",
				alt: "The Sunday dinner group with no expenses yet and an Add expense button.",
			},
			{
				title: "Fill in what was paid",
				body: "Add a description, amount, currency, date and who paid. Notes are optional. Splits stay in the currency you pick; changing it does not convert the amount.",
				image: "/help/expense-details.png",
				alt: "The Add an expense dialog on the Details step, with Groceries and ₹2,400 filled in.",
			},
			{
				title: "Choose the split",
				body: "Even is the default. Exact, shares and percent let you weight the bill. Untick anyone who should sit this one out.",
				image: "/help/expense-split.png",
				alt: "The Split step with Even selected and Tushar assigned ₹2,400.",
			},
			{
				title: "Review, then add it",
				body: "Confirm the total, who paid, and each person's share. The expense appears on the group list as soon as you add it.",
				image: "/help/expense-review.png",
				alt: "The Review step for Groceries, paid by Tushar on 14 September 2026.",
			},
		],
	},
];

export function helpArticle(slug: string) {
	return HELP_ARTICLES.find((article) => article.slug === slug);
}
