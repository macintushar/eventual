import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpShot } from "#/components/help-shot";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { Button } from "#/components/ui/button";
import { type HelpArticle, helpArticle } from "#/lib/help";

export const Route = createFileRoute("/help/")({
	head: () => ({ meta: [{ title: "Help center · Eventual" }] }),
	component: HelpIndex,
});

type FaqItem = {
	id: string;
	question: string;
	answer: string;
	more?: { to: "/help/$slug"; slug: "create-a-group" | "add-an-expense" };
	shots?: { src: string; alt: string; caption: string }[];
};

type FaqCategory = {
	title: string;
	items: FaqItem[];
};

const categories: FaqCategory[] = [
	{
		title: "Getting started",
		items: [
			{
				id: "create-group",
				question: "How do I create a group?",
				answer:
					"Use New group on the dashboard, or the plus in the dock. Name the shared tab, invite people if you already know who belongs, then create it. You land on the group page, ready for the first expense.",
				more: { to: "/help/$slug", slug: "create-a-group" },
				shots: [
					{
						src: "/help/group-name.png",
						alt: "The Start a group dialog with Sunday dinner as the name.",
						caption: "Name the group, or pick a suggestion.",
					},
				],
			},
			{
				id: "add-expense",
				question: "How do I add an expense?",
				answer:
					"Open a group and choose Add expense. Fill in what was paid, who paid, and how to split it. Review the shares, then add it — it appears on the group list straight away.",
				more: { to: "/help/$slug", slug: "add-an-expense" },
				shots: [
					{
						src: "/help/expense-details.png",
						alt: "The Add an expense dialog with Groceries and ₹2,400 filled in.",
						caption: "Description, amount, currency, date and who paid.",
					},
				],
			},
			{
				id: "dock",
				question: "Where do I start from the dock?",
				answer:
					"The plus in the centre of the dock is the same action everywhere. New expense splits a cost; New group starts a shared tab. If you are already in a group, the expense form arrives with that group selected.",
				shots: [
					{
						src: "/help/compose-menu.png",
						alt: "The dock plus menu offering New expense and New group.",
						caption:
							"Both actions live behind the plus, on every signed-in page.",
					},
				],
			},
		],
	},
	{
		title: "Groups",
		items: [
			{
				id: "what-is-a-group",
				question: "What is a group?",
				answer:
					"A group is a shared tab: its own expenses, balances and members. Only invited people can see it. Create one for a trip, a flat, or a run of office lunches.",
			},
			{
				id: "invite",
				question: "How do I invite people?",
				answer:
					"You can invite by email while creating the group, or later from the Members tab. They get a link. Until they accept, they are pending — they do not yet share expenses.",
			},
			{
				id: "roles",
				question: "What are owner, admin and member?",
				answer:
					"The person who creates the group is the owner. Admins can invite and manage members. Members can log expenses and settle their share. You can change roles from Members.",
			},
		],
	},
	{
		title: "Expenses & splits",
		items: [
			{
				id: "splits",
				question: "How do splits work?",
				answer:
					"Even splits everyone selected the same amount, rounded to the currency's smallest unit so the shares add up exactly. Exact, shares and percent let you type weights. Untick anyone who should sit the bill out.",
			},
			{
				id: "locked",
				question: "What does a locked expense mean?",
				answer:
					"Once someone marks their share paid, the expense locks. The settled amount cannot quietly change afterwards. Unmark every paid share before you can edit or delete it.",
			},
			{
				id: "settle",
				question: "How do I settle up?",
				answer:
					"The Balances tab shows who owes whom, simplified into as few transfers as possible. Record a repayment there when money actually moves. Eventual keeps each currency separate.",
			},
		],
	},
	{
		title: "Account & integrations",
		items: [
			{
				id: "password",
				question: "How do I change my password?",
				answer:
					"On the login screen, use Forgot your password? We email a one-hour link. After a reset, existing sessions are signed out.",
			},
			{
				id: "shortcut",
				question: "How do I log an expense from my iPhone?",
				answer:
					"The Apple Shortcut logs an even split in three taps: pick the group, who paid, and the amount. You can fine-tune the split later in the app. Get it from Integrations.",
			},
			{
				id: "mcp",
				question: "Can an AI assistant log expenses for me?",
				answer:
					"Yes. Create an API key under your account, then connect Eventual as an MCP server. Ask it to log a dinner or tell you who owes what. Setup lives on Integrations.",
			},
		],
	},
];

function faqGallery(
	item: FaqItem,
	shot: NonNullable<FaqItem["shots"]>[number],
): { steps: HelpArticle["steps"]; index: number } {
	if (item.more) {
		const article = helpArticle(item.more.slug);
		if (article) {
			const index = article.steps.findIndex((step) => step.image === shot.src);
			return {
				steps: article.steps,
				index: index < 0 ? 0 : index,
			};
		}
	}
	return {
		steps: [
			{
				title: shot.caption,
				body: item.answer,
				image: shot.src,
				alt: shot.alt,
			},
		],
		index: 0,
	};
}

function HelpIndex() {
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
			<nav className="flex flex-col gap-6">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to="/help" className="text-tape no-underline">
									Help center
								</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>Home</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>

				<div className="flex flex-col items-center gap-3 text-center">
					<h1 className="display-title text-[2.125rem] font-bold sm:text-4xl">
						Frequently asked questions
					</h1>
					<p className="max-w-lg text-muted-foreground">
						How to start a group, split a bill, and settle up without the
						spreadsheet.
					</p>
				</div>
			</nav>

			<div className="flex flex-col gap-6">
				{categories.map((category, index) => (
					<section
						key={category.title}
						className="island-shell overflow-hidden rounded-2xl"
					>
						<h2 className="px-5 pt-5 pb-2 text-sm font-medium text-tape">
							{category.title}
						</h2>
						<Accordion
							type="single"
							collapsible
							defaultValue={index === 0 ? category.items[0]?.id : undefined}
						>
							{category.items.map((item) => (
								<AccordionItem key={item.id} value={item.id} className="px-5">
									<AccordionTrigger className="py-4 text-base font-medium hover:no-underline">
										{item.question}
									</AccordionTrigger>
									<AccordionContent className="flex flex-col gap-4 pb-5">
										<p className="text-muted-foreground">{item.answer}</p>
										{item.shots?.map((shot) => {
											const gallery = faqGallery(item, shot);
											return (
												<HelpShot
													key={shot.src}
													steps={gallery.steps}
													index={gallery.index}
													caption={shot.caption}
												/>
											);
										})}
										{item.more ? (
											<Link
												to={item.more.to}
												params={{ slug: item.more.slug }}
												className="w-fit text-sm font-medium text-tape no-underline hover:underline"
											>
												Read more
											</Link>
										) : null}
									</AccordionContent>
								</AccordionItem>
							))}
						</Accordion>
					</section>
				))}
			</div>

			<section className="flex flex-col items-center gap-4 pb-8 text-center">
				<p className="font-medium">Still unsure about something?</p>
				<Button size="lg" asChild>
					<a href="mailto:hello@eventual.app?subject=Eventual%20help">
						Send feedback
					</a>
				</Button>
			</section>
		</div>
	);
}
