/** Bump whenever the help center or a guide's wording changes. */
export const HELP_UPDATED = { iso: "2026-10-18", label: "18 October 2026" };

export type HelpArticle = {
	slug:
		| "create-a-group"
		| "add-an-expense"
		| "invite-people"
		| "settle-up"
		| "locked-expenses"
		| "use-the-mobile-app";
	title: string;
	kicker: string;
	lede: string;
	/**
	 * A screenshot always comes with its alt text. A step without one is text
	 * only and skipped by the gallery.
	 */
	steps: ({ title: string; body: string } & (
		| { image: string; alt: string }
		| { image?: never; alt?: never }
	))[];
};

/** A step that has a screenshot, which is what the gallery shows. */
export type HelpShotStep = Extract<
	HelpArticle["steps"][number],
	{ image: string }
>;

export function shotSteps(article: HelpArticle): HelpShotStep[] {
	return article.steps.filter((step): step is HelpShotStep =>
		Boolean(step.image),
	);
}

export const HELP_ARTICLES: HelpArticle[] = [
	{
		slug: "create-a-group",
		title: "How do I create a group?",
		kicker: "Groups",
		lede: "A group is one shared set of expenses — a trip, a flat, a run of lunches. Name it, invite people if you like, then log costs as they happen.",
		steps: [
			{
				title: "Open New group",
				body: "From the dashboard, tap New group. On mobile, tap the plus at the bottom of the screen and choose New group. Either way, a short dialog opens over the current page.",
				image: "/help/dashboard.webp",
				alt: "The Eventual dashboard with a New group button next to the group list.",
			},
			{
				title: "Give it a name",
				body: "Type a name, or pick one of the suggestions. The group holds its own expenses, balances and members.",
				image: "/help/group-name.webp",
				alt: "The Start a group dialog on the Name step, with Sunday dinner typed in.",
			},
			{
				title: "Invite people, or skip",
				body: "Add emails if you already know who belongs. You can leave this empty and invite later from the group's Members tab.",
				image: "/help/group-people.webp",
				alt: "The People step with mac@eventual.test added as a member.",
			},
			{
				title: "Review and create",
				body: "Check the name and invites, then create the group. You become its owner and land on the empty group page, ready for the first expense.",
				image: "/help/group-review.webp",
				alt: "The Review step showing Sunday dinner and one invited member.",
			},
		],
	},
	{
		slug: "add-an-expense",
		title: "How do I add an expense?",
		kicker: "Expenses",
		lede: "Open a group and log what was paid. Eventual handles the rounding, so shares always add up to the total.",
		steps: [
			{
				title: "Start from the group",
				body: "Open the group, then use Add expense — or the plus in the dock. If you are already in a group, the form skips ahead to the details.",
				image: "/help/group-empty.webp",
				alt: "The Sunday dinner group with no expenses yet and an Add expense button.",
			},
			{
				title: "Fill in what was paid",
				body: "Add a description, amount, currency, date and who paid. Notes are optional. Splits stay in the currency you pick; changing it does not convert the amount.",
				image: "/help/expense-details.webp",
				alt: "The Add an expense dialog on the Details step, with Groceries and ₹2,400 filled in.",
			},
			{
				title: "Choose the split and add it",
				body: "The default is Split evenly when all member weights match, or By group weight otherwise. Use Exact amounts, By ratio for a one-off ratio, or By percentage. Untick anyone sitting this out, check the live per-person preview, then add the expense.",
				image: "/help/expense-split.webp",
				alt: "The Split step showing Tushar assigned ₹2,400.",
			},
		],
	},
	{
		slug: "invite-people",
		title: "How do I invite people to a group?",
		kicker: "Members",
		lede: "Add people from the group's Members tab. They can be part of expenses straight away, and if you add an email, they get an invite to see the group themselves.",
		steps: [
			{
				title: "Open Members",
				body: "In the group, open the Members tab and use Add person. Owners and admins can add people; you can see everyone's role next to their name.",
				image: "/help/invite-members.webp",
				alt: "The Goa Weekend group on the Members tab, listing three members and an Add person button.",
			},
			{
				title: "Add their name, and email if they'll use the app",
				body: "Type a name and pick a role. Add their email so they can see the group: people already on Eventual are added and notified, everyone else gets an invite. Leave the email blank for someone who won't use the app. Phone and weight are optional.",
				image: "/help/invite-add.webp",
				alt: "The Add a person dialog with Priya and priya@example.com filled in and the Member role selected.",
			},
			{
				title: "Share the invite link",
				body: "Copy the link and send it however your group talks. They join with it to see the group and add expenses themselves. Until then they show as a guest, and you can already split with them.",
				image: "/help/invite-share.webp",
				alt: "The Share the invite dialog showing an invite link with a Copy button, and Priya listed as an invited guest.",
			},
		],
	},
	{
		slug: "settle-up",
		title: "How do I settle up?",
		kicker: "Balances",
		lede: "The Balances tab shows who owes whom in as few payments as possible. When money actually changes hands, record it so the balance moves.",
		steps: [
			{
				title: "Open Balances",
				body: "Net balances show where each person stands: a positive amount means the group owes them. Simplified debts lists the fewest payments that settle everyone, separately for each currency.",
				image: "/help/settle-balances.webp",
				alt: "The Balances tab with net balances on the left and two suggested payments under Simplified debts.",
			},
			{
				title: "Record the payment",
				body: "Use Record payment on a suggested row and the payer, recipient and amount are filled in. You can see the recipient's contact and payment details. Any amount works: paying more than owed just flips who owes whom. If you're paying someone who has added a UPI ID, Pay via UPI opens your UPI app first.",
				image: "/help/settle-dialog.webp",
				alt: "The Record a payment dialog with Arjun Mehta paying Tushar Sharma ₹18.35, the suggested amount.",
			},
			{
				title: "Check it's done",
				body: "The payment appears in Payment history, and balances and suggested payments update. A partial payment leaves the rest to pay; paying more than owed flips who owes whom. Shares it fully covers are marked paid automatically, which locks those expenses. Recorded it by mistake? Delete it from the history.",
				image: "/help/settle-history.webp",
				alt: "The Balances tab after the payment: one suggested payment left and the new payment at the top of Payment history.",
			},
		],
	},
	{
		slug: "locked-expenses",
		title: "Why is an expense locked?",
		kicker: "Expenses",
		lede: "Once anyone's share of an expense is marked paid, the expense locks. That way the amount someone settled can't change after they paid it.",
		steps: [
			{
				title: "Open the expense",
				body: "Who owes what lists every share. A share can be marked paid by the person who owes it, or by whoever paid the expense.",
				image: "/help/lock-shares.webp",
				alt: "The Movie night expense with three unpaid shares and a Paid checkbox next to each.",
			},
			{
				title: "Mark a share paid",
				body: "Tick Paid and the expense locks. The banner says who paid and when. Editing and deleting stay blocked until every paid share is unmarked again.",
				image: "/help/lock-locked.webp",
				alt: "The Movie night expense with a Locked banner saying Arjun Mehta marked their share paid.",
			},
			{
				title: "Spot locked expenses in the list",
				body: "Locked expenses carry a Locked badge in the group's expense list. Recording a payment can lock expenses too, because it marks the shares it covers as paid.",
				image: "/help/lock-list.webp",
				alt: "The group's expense list with Locked badges next to Movie night and Villa groceries.",
			},
		],
	},
	{
		slug: "use-the-mobile-app",
		title: "How do I use the iPhone or Android app?",
		kicker: "Mobile app",
		lede: "Eventual has a native app for iPhone and Android with the same groups, expenses and balances as the web. It isn't in the App Store or Play Store yet, so for now you build it yourself.",
		steps: [
			{
				title: "Build it on your computer",
				body: "Clone the open-source repository, run bun install, then bun run --cwd apps/mobile ios (or android). You need Xcode for iPhone or Android Studio for Android. The mobile app README in the repository has the details.",
			},
			{
				title: "Choose your server",
				body: "The app opens on hosted Eventual. To use another instance, tap Change next to the server on the sign-in screen and enter its address. Your groups stay on the server you sign in to.",
			},
			{
				title: "Sign in with your account",
				body: "Use the same email and password as on the web, or Google or Apple sign-in where the server offers them. You don't need an API key.",
			},
			{
				title: "Split, settle and get notified",
				body: "Add and edit expenses, record payments with a UPI handoff, invite people and manage recurring expenses. Push notifications work on hosted Eventual; self-hosted servers don't send them yet.",
			},
		],
	},
];

export function helpArticle(slug: string) {
	return HELP_ARTICLES.find((article) => article.slug === slug);
}
