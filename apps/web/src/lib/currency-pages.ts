import type { SplitMethod } from "@eventual/schemas/split";

/**
 * Hand-written pages for the currencies people actually split in. Each one
 * must say something the others don't; if a currency has nothing of its own
 * to explain, it stays a row on the /split-expenses hub instead.
 */
export type CurrencyExample = {
	label: string;
	totalMinor: number;
	method: SplitMethod;
	/** Per-person input, in the order of EXAMPLE_PEOPLE. Omitted for even splits. */
	inputs?: number[];
	/** Head count for even splits; defaults to three. */
	people?: number;
	note: string;
};

export type CurrencyPage = {
	code: "INR" | "AED" | "THB" | "VND";
	slug: string;
	title: string;
	description: string;
	kicker: string;
	/** "Indian rupees", for "How a bill splits in Indian rupees". */
	plural: string;
	lede: string;
	examples: CurrencyExample[];
	points: { title: string; text: string }[];
	faqs: { question: string; answer: string }[];
};

/** Sorted by ID, which is the order the splitter breaks ties in. */
export const EXAMPLE_PEOPLE = ["You", "Mac", "Arjun", "Priya"] as const;

export const CURRENCY_PAGES: CurrencyPage[] = [
	{
		code: "INR",
		slug: "inr",
		title: "Split group expenses in rupees, to the last paisa",
		description:
			"Split rent, trips and dinners in Indian rupees. Eventual rounds to the paisa so shares always add up, shows amounts in lakh grouping, and hands off to UPI when you settle.",
		kicker: "Indian rupee · ₹",
		plural: "Indian rupees",
		lede: "Flat rent, a Goa weekend, the chai-and-samosa run. Log it in rupees and Eventual works out who pays whom, down to the paisa, with no rupee lost to rounding.",
		examples: [
			{
				label: "₹1,000 dinner, three ways",
				totalMinor: 100_000,
				method: "even",
				note: "One paisa can't be split three ways, so one person carries it. The total is still exactly ₹1,000.",
			},
			{
				label: "₹45,000 rent, by room size",
				totalMinor: 4_500_000,
				method: "shares",
				inputs: [2, 1, 1],
				note: "The bigger room pays two shares. Set it once as member weights and every bill in the flat follows it.",
			},
		],
		points: [
			{
				title: "Lakh and crore grouping",
				text: "Amounts read the way you'd say them: ₹1,23,456.70, not ₹123,456.70.",
			},
			{
				title: "Settle over UPI",
				text: "On the iPhone and Android app, paying someone who has added a UPI ID opens your UPI app with the amount filled in. Come back, confirm it went through, and the payment is recorded.",
			},
			{
				title: "Paid shares lock",
				text: "Once a flatmate marks their share paid, that expense can't be edited until it's unmarked, so the amount they paid can't drift.",
			},
		],
		faqs: [
			{
				question: "Does Eventual send money over UPI?",
				answer:
					"No. Eventual records who owes whom. The mobile app can open your UPI app with the amount filled in, but the payment happens there, and you confirm it in Eventual afterwards.",
			},
			{
				question: "Can a group mix rupees and other currencies?",
				answer:
					"Yes. Each expense keeps its own currency, and balances are worked out separately per currency. Eventual never converts between them.",
			},
			{
				question: "Is it free?",
				answer:
					"Yes. There are no paid plans and no ads, and the code is open source under the AGPL, so you can also run your own copy.",
			},
		],
	},
	{
		code: "AED",
		slug: "aed",
		title: "Split flat and trip expenses in UAE dirhams",
		description:
			"Share a flat in Dubai or plan a trip to the UAE? Eventual splits expenses in dirhams to the fils, keeps them apart from rupees, and tells everyone who pays whom.",
		kicker: "UAE dirham · AED",
		plural: "UAE dirhams",
		lede: "A shared flat in Dubai, or a long weekend in Abu Dhabi with friends flying in from India. Log costs in dirhams, keep the rupee spends separate, and settle each currency on its own.",
		examples: [
			{
				label: "AED 250 brunch, three ways",
				totalMinor: 25_000,
				method: "even",
				note: "A dirham is 100 fils. The odd fils goes to one person, and the shares still add up to AED 250.",
			},
			{
				label: "AED 1,180 utility bill, by percentage",
				totalMinor: 118_000,
				method: "percent",
				inputs: [4000, 3000, 3000],
				note: "The person who works from home takes 40% of the bill. Percentages must add up to 100.",
			},
		],
		points: [
			{
				title: "Dirhams and rupees, side by side",
				text: "Book the hotel in dirhams and the flights in rupees. The group shows a balance for each currency, so nobody has to agree on an exchange rate.",
			},
			{
				title: "No conversion, ever",
				text: "Eventual doesn't fetch rates or convert amounts. You settle dirham debts in dirhams and rupee debts in rupees.",
			},
			{
				title: "Recurring rent",
				text: "Set the monthly rent up once as a recurring expense and it's added every month, split the same way each time.",
			},
		],
		faqs: [
			{
				question: "Can I see what I owe in rupees?",
				answer:
					"No. Eventual keeps every currency separate and never converts, so a dirham balance stays in dirhams. That avoids arguing over which day's rate to use.",
			},
			{
				question: "How do I settle a dirham balance?",
				answer:
					"Pay however you normally would, then record the payment in the group in AED. Only AED debts move; rupee balances are untouched.",
			},
		],
	},
	{
		code: "THB",
		slug: "thb",
		title: "Split Thailand trip expenses in baht",
		description:
			"Splitting a Phuket villa or a Bangkok food crawl? Eventual splits expenses in Thai baht evenly, by shares or by percentage, and shows who owes whom when you're back.",
		kicker: "Thai baht · ฿",
		plural: "Thai baht",
		lede: "The villa in Phuket, the long-tail boat, the night-market crawl in Bangkok. Log each one in baht as it happens and settle up once when you're home.",
		examples: [
			{
				label: "฿1,450 boat trip, three ways",
				totalMinor: 145_000,
				method: "even",
				note: "Most prices are whole baht, but shares are still exact to the satang, so the total never drifts.",
			},
			{
				label: "฿18,000 villa, two couples and a single",
				totalMinor: 1_800_000,
				method: "shares",
				inputs: [2, 2, 1],
				note: "Couples count as two shares, so the villa splits 2:2:1 instead of evenly.",
			},
		],
		points: [
			{
				title: "Log it on the go",
				text: "Log each one in baht from the iPhone or Android app while you're out, then fix the split or payer later from either app.",
			},
			{
				title: "Not everyone, every time",
				text: "Untick whoever skipped the elephant sanctuary. They aren't charged for it, and the shares rebalance across everyone else.",
			},
			{
				title: "Baht stays baht",
				text: "Flights booked in rupees and street food paid in baht show as separate balances. Nothing is converted.",
			},
		],
		faqs: [
			{
				question: "Do I have to enter satang?",
				answer:
					"No. Enter whole baht if that's what you paid. Eventual still splits to the satang, so the shares add up exactly.",
			},
			{
				question: "Can friends without an account join the trip?",
				answer:
					"Yes. Add them as guests and split with them straight away. If they sign up later, they can take over the guest's place, with its expenses and balances.",
			},
		],
	},
	{
		code: "VND",
		slug: "vnd",
		title: "Split Vietnam trip expenses in dong",
		description:
			"Splitting a trip to Hanoi, Da Nang or Ho Chi Minh City? Eventual splits expenses in Vietnamese dong, a currency with no decimals, so shares are always whole đồng.",
		kicker: "Vietnamese dong · ₫",
		plural: "Vietnamese dong",
		lede: "Dong prices run to six and seven digits, and there's no smaller unit. Eventual splits in whole đồng, gives the odd đồng to one person, and keeps the totals exact.",
		examples: [
			{
				label: "₫1,000,000 dinner, three ways",
				totalMinor: 1_000_000,
				method: "even",
				note: "The dong has no decimals, so the leftover đồng goes to one person instead of being split further.",
			},
			{
				label: "₫450,000 phở crawl, four ways",
				totalMinor: 450_000,
				method: "even",
				people: 4,
				note: "When it divides evenly, everyone pays the same.",
			},
		],
		points: [
			{
				title: "No decimals to type",
				text: "The amount field takes whole đồng only, so there's no stray ,00 on a ₫2,500,000 hotel bill.",
			},
			{
				title: "Indian digit grouping",
				text: "Eventual groups digits the Indian way in every currency, so ₫3,33,334 is three lakh, thirty-three thousand, three hundred and thirty-four đồng.",
			},
			{
				title: "Currencies stay separate",
				text: "Spend in dong in Vietnam and rupees at home, and the group keeps a balance for each. Nothing is converted.",
			},
		],
		faqs: [
			{
				question: "Which other currencies have no decimals?",
				answer:
					"Japanese yen and South Korean won, along with the dong. The Kuwaiti dinar goes the other way, with three decimals.",
			},
			{
				question: "How are shares rounded?",
				answer:
					"Each share is rounded down to a whole đồng, and the leftover đồng go one at a time to whoever was rounded down most. The shares always add up to the total.",
			},
		],
	},
];

export function currencyPage(slug: string) {
	return CURRENCY_PAGES.find((page) => page.slug === slug);
}
