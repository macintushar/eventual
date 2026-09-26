import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	type LucideIcon,
	Mail,
	Receipt,
	Rocket,
	UserRound,
	Users,
} from "lucide-react";
import { HelpShot } from "#/components/help-shot";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "#/components/ui/card";
import {
	HELP_ARTICLES,
	HELP_UPDATED,
	type HelpArticle,
	helpArticle,
} from "#/lib/help";
import { siteQueryOptions } from "#/lib/queries";
import { SITE_URL } from "#/lib/site";

export const Route = createFileRoute("/help/")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(siteQueryOptions),
	head: () => ({
		meta: [
			{ title: "Help center · Eventual" },
			{
				name: "description",
				content:
					"Answers on creating groups, adding expenses, split methods, locked expenses and repayments in Eventual.",
			},
			{
				property: "og:title",
				content: "Help center · Eventual",
			},
			{
				name: "twitter:card",
				content: "summary",
			},
		],
		links: [
			{
				rel: "canonical",
				href: `${SITE_URL}/help`,
			},
		],
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@type": "FAQPage",
					mainEntity: categories.flatMap((category) =>
						category.items.map((item) => ({
							"@type": "Question",
							name: item.question,
							acceptedAnswer: {
								"@type": "Answer",
								text: item.answer,
							},
						})),
					),
				}),
			},
		],
	}),
	component: HelpIndex,
});

type FaqItem = {
	id: string;
	question: string;
	answer: string;
	more?: { slug: "create-a-group" | "add-an-expense" };
	shots?: { src: string; alt: string; caption: string }[];
};

type FaqCategory = {
	/** Anchor for the topic list. */
	id: string;
	title: string;
	icon: LucideIcon;
	items: FaqItem[];
};

const guideIcons: Record<HelpArticle["slug"], LucideIcon> = {
	"create-a-group": Users,
	"add-an-expense": Receipt,
};

const categories: FaqCategory[] = [
	{
		id: "getting-started",
		title: "Getting started",
		icon: Rocket,
		items: [
			{
				id: "create-group",
				question: "How do I create a group?",
				answer:
					"Use New group on the dashboard, or the plus in the dock. Name the group, invite people if you already know who belongs, then create it. You land on the group page, ready for the first expense.",
				more: { slug: "create-a-group" },
				shots: [
					{
						src: "/help/group-name.webp",
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
				more: { slug: "add-an-expense" },
				shots: [
					{
						src: "/help/expense-details.webp",
						alt: "The Add an expense dialog with Groceries and ₹2,400 filled in.",
						caption: "Description, amount, currency, date and who paid.",
					},
				],
			},
			{
				id: "dock",
				question: "Where do I start from the dock?",
				answer:
					"The plus in the middle of the dock is the same action everywhere. New expense splits a cost; New group starts a group. If you are already in a group, the expense form arrives with that group selected.",
				shots: [
					{
						src: "/help/compose-menu.webp",
						alt: "The dock plus menu offering New expense and New group.",
						caption:
							"Both actions live behind the plus, on every signed-in page.",
					},
				],
			},
		],
	},
	{
		id: "groups",
		title: "Groups",
		icon: Users,
		items: [
			{
				id: "what-is-a-group",
				question: "What is a group?",
				answer:
					"A group keeps its own expenses, balances and members. Only invited people can see it. Create one for a trip, a flat, or a run of office lunches.",
			},
			{
				id: "invite",
				question: "How do I invite people?",
				answer:
					"You can invite by email while creating the group, or later from the Members tab. They get a link. Until they accept, they appear as pending and aren't included in new expenses.",
			},
			{
				id: "roles",
				question: "What are owner, admin and member?",
				answer:
					"The person who creates the group is the owner. Admins can invite and manage members. Members can log expenses and settle their share. The owner can change roles from Members.",
			},
		],
	},
	{
		id: "expenses",
		title: "Expenses & splits",
		icon: Receipt,
		items: [
			{
				id: "splits",
				question: "How do splits work?",
				answer:
					"Even splits everyone selected the same amount, rounded to the currency's smallest unit so the shares add up exactly. Exact takes amounts, shares takes ratios and percent takes percentages. Untick anyone who shouldn't pay a share.",
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
					"The Balances tab shows who owes whom, simplified into as few transfers as possible. Use Record settlement there when money actually moves. Eventual keeps each currency separate.",
			},
		],
	},
	{
		id: "account",
		title: "Account & integrations",
		icon: UserRound,
		items: [
			{
				id: "password",
				question: "How do I reset my password?",
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
	const { supportEmail } = useSuspenseQuery(siteQueryOptions).data;

	return (
		<div className="flex flex-col gap-10 sm:gap-12">
			<section className="rise-in max-w-2xl">
				<p className="island-kicker">Help center</p>
				<h1 className="display-title mt-4 text-[2.125rem] leading-tight font-bold sm:text-4xl md:text-5xl">
					How can we help?
				</h1>
				<p className="mt-4 text-base text-muted-foreground sm:text-lg">
					How to start a group, split a bill, and settle up without the
					spreadsheet.
				</p>
				<p className="mt-3 text-sm text-muted-foreground">
					Last updated{" "}
					<time dateTime={HELP_UPDATED.iso}>{HELP_UPDATED.label}</time>
				</p>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="text-sm font-medium text-muted-foreground">
					Step-by-step guides
				</h2>
				<div className="grid gap-3 sm:gap-4 md:grid-cols-2">
					{HELP_ARTICLES.map((article) => {
						const Icon = guideIcons[article.slug];
						return (
							<Link
								key={article.slug}
								to="/help/$slug"
								params={{ slug: article.slug }}
								className="no-underline"
							>
								<Card className="feature-card h-full">
									<CardHeader>
										<div className="mb-2 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
											<Icon className="size-5" aria-hidden="true" />
										</div>
										<h3 className="flex items-center gap-2 font-semibold">
											{article.title}
											<ArrowRight className="size-4" aria-hidden="true" />
										</h3>
										<CardDescription>
											{article.steps.length} steps · {article.lede}
										</CardDescription>
									</CardHeader>
								</Card>
							</Link>
						);
					})}
				</div>
			</section>

			<div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
				<aside className="hidden lg:block">
					<nav className="sticky top-8 flex flex-col gap-3">
						<p className="text-sm font-medium text-muted-foreground">Topics</p>
						<ul className="flex flex-col gap-1">
							{categories.map((category) => (
								<li key={category.id}>
									<a
										href={`#${category.id}`}
										className="-mx-2 block rounded-lg px-2 py-1.5 text-sm no-underline hover:bg-muted"
									>
										{category.title}
									</a>
								</li>
							))}
						</ul>
					</nav>
				</aside>

				<div className="flex flex-col gap-6">
					{categories.map((category, index) => {
						const Icon = category.icon;
						return (
							<Card
								key={category.id}
								id={category.id}
								className="island-shell scroll-mt-8 gap-0 rounded-3xl pb-2"
							>
								<CardHeader>
									<div className="flex items-center gap-2">
										<Icon className="size-5 text-primary" aria-hidden="true" />
										<h2 className="display-title text-2xl font-bold">
											{category.title}
										</h2>
									</div>
								</CardHeader>
								<CardContent>
									<Accordion
										type="single"
										collapsible
										defaultValue={
											index === 0 ? category.items[0]?.id : undefined
										}
									>
										{category.items.map((item) => (
											<AccordionItem key={item.id} value={item.id}>
												<AccordionTrigger className="py-4 text-base font-medium hover:no-underline">
													{item.question}
												</AccordionTrigger>
												<AccordionContent
													// Rendered while closed so every answer is in the
													// prerendered HTML, matching the FAQPage JSON-LD.
													forceMount
													className="flex flex-col gap-4 pb-5"
												>
													<p className="max-w-prose text-muted-foreground">
														{item.answer}
													</p>
													{item.shots?.map((shot) => {
														const gallery = faqGallery(item, shot);
														return (
															<HelpShot
																key={shot.src}
																steps={gallery.steps}
																index={gallery.index}
																caption={shot.caption}
																moreLabel={
																	item.more ? "See all steps" : undefined
																}
															/>
														);
													})}
												</AccordionContent>
											</AccordionItem>
										))}
									</Accordion>
								</CardContent>
							</Card>
						);
					})}
				</div>
			</div>

			<section className="island-shell mb-4 flex flex-col items-start gap-4 rounded-3xl border p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 className="display-title text-[1.75rem] font-bold sm:text-3xl">
						Can't find what you're looking for?
					</h2>
					<p className="mt-2 text-muted-foreground">
						{supportEmail
							? "Email us and we'll reply as soon as we can."
							: "Setting up the Shortcut or an AI assistant? Integrations has the full walkthrough."}
					</p>
				</div>
				<div className="flex flex-wrap gap-3">
					{supportEmail ? (
						<Button size="lg" asChild>
							<a href={`mailto:${supportEmail}?subject=Eventual%20help`}>
								<Mail data-icon="inline-start" />
								Email us
							</a>
						</Button>
					) : null}
					<Button
						size="lg"
						variant={supportEmail ? "outline" : "default"}
						asChild
					>
						<Link to="/docs">
							Set up integrations
							<ArrowRight data-icon="inline-end" />
						</Link>
					</Button>
				</div>
			</section>
		</div>
	);
}
