import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	EmailLink,
	LegalList,
	LegalPage,
	LegalSection,
	SOURCE_URL,
} from "#/components/legal-page";
import { legalQueryOptions } from "#/lib/queries";
import { SITE_URL } from "#/lib/site";

export const Route = createFileRoute("/terms")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(legalQueryOptions),
	head: () => ({
		meta: [
			{ title: "Terms of service · Eventual" },
			{
				name: "description",
				content: "Plain-language terms for using Eventual and its API.",
			},
		],
		links: [{ rel: "canonical", href: `${SITE_URL}/terms` }],
	}),
	component: TermsOfService,
});

function TermsOfService() {
	const { operator, governingLaw, contactEmail, origin } =
		useSuspenseQuery(legalQueryOptions).data;

	return (
		<LegalPage
			kicker="Terms"
			title="Terms of service"
			url={`${origin}/terms`}
			lede={<p>Plain-language terms for using Eventual and its API.</p>}
		>
			<LegalSection id="agreement" title="Who you're agreeing with">
				<p>
					{operator
						? `Eventual at ${origin} is run by ${operator} ("we").`
						: `Eventual is open-source software, and this copy at ${origin} is run independently by whoever set it up ("we"). The Eventual project isn't a party to these terms.`}{" "}
					Using the site, the API, the MCP server or the Apple Shortcut means
					you accept these terms and the{" "}
					<Link to="/privacy">privacy policy</Link>.
				</p>
				<p>
					The code at <a href={SOURCE_URL}>{SOURCE_URL}</a> has its own licence.
					If you run your own copy, you're the operator and set your own terms.
				</p>
			</LegalSection>

			<LegalSection id="not-a-bank" title="Eventual doesn't move money">
				<p>
					Eventual is a ledger, not a bank, payment service or financial
					adviser. We never hold, send or receive money. UPI links just open
					your payment app; the payment is between you and your payment
					provider.
				</p>
				<p>
					Debts in Eventual are between the people in your group. We're not a
					party to them and don't collect them or settle disputes.
				</p>
			</LegalSection>

			<LegalSection id="check" title="Check the numbers">
				<p>
					Balances come from what group members enter. We don't verify expenses
					or repayments, and we don't convert currencies. Reminders and
					recurring expenses run on a daily schedule and can arrive late. Check
					the figures before you pay anyone, and keep your own records of
					anything that matters.
				</p>
			</LegalSection>

			<LegalSection id="account" title="Your account">
				<p>
					You must be 18 or over. Keep your password and API keys secret. You're
					responsible for everything done with them, including by apps and AI
					assistants you've given a key to. If you think someone else has
					access, tell us straight away.
				</p>
			</LegalSection>

			<LegalSection id="content" title="Your content">
				<p>
					What you log is yours. You let us store it and show it to your group
					members, only to run Eventual. When you add someone to a group, make
					sure they'd expect to be there.
				</p>
			</LegalSection>

			<LegalSection id="use" title="Fair use">
				<p>Don't use Eventual to:</p>
				<LegalList>
					<li>break the law, launder money, or evade tax or sanctions</li>
					<li>harass or defraud anyone, or record debts you know are false</li>
					<li>get into accounts or groups that aren't yours</li>
					<li>
						probe the service's security without permission; report issues
						privately instead
					</li>
					<li>
						get around rate limits, or create accounts or data in bulk by script
					</li>
				</LegalList>
			</LegalSection>

			<LegalSection id="api" title="API, MCP and AI assistants">
				<p>
					The API is rate-limited. Anything using your key, including an AI
					assistant, acts as you: it can read your groups and add expenses.
					Revoke a key when you stop trusting whatever uses it. We may revoke
					keys or block traffic that degrades the service for others. See the{" "}
					<Link to="/docs">integration docs</Link> for setup.
				</p>
			</LegalSection>

			<LegalSection id="warranty" title="No warranty">
				<p>
					Eventual is free and provided "as is", without warranty of any kind.
					We make no guarantees about availability, accuracy, or fitness for a
					particular purpose, and may change or stop the service. We'll give
					notice before shutting down so you can export your data.
				</p>
			</LegalSection>

			<LegalSection id="liability" title="Liability">
				<p>
					As far as the law allows, we're not liable for indirect losses, lost
					data, or money owed, paid or lost between users, even if a balance was
					wrong. Our total liability is capped at the greater of what you paid
					us in the last 12 months and US$50. Nothing here limits rights you
					have as a consumer or liability that can't be limited by law.
				</p>
			</LegalSection>

			<LegalSection id="ending" title="Ending your account">
				<p>
					You can stop using Eventual and ask us to delete your account at any
					time. We may suspend accounts that break these terms, and will tell
					you why where we can.
				</p>
			</LegalSection>

			<LegalSection id="law" title="Governing law">
				<p>
					{governingLaw
						? `These terms are governed by the laws of ${governingLaw}, and its courts decide disputes.`
						: "These terms are governed by the laws where the operator of this instance is based, and those courts decide disputes."}{" "}
					Consumer protections where you live still apply.
				</p>
			</LegalSection>

			<LegalSection id="changes" title="Changes">
				<p>
					We may revise these terms as Eventual evolves. We'll update the date
					at the top and tell you before material changes take effect. Using
					Eventual after that means you accept them.
				</p>
			</LegalSection>

			<LegalSection id="contact" title="Contact">
				<p>
					{contactEmail ? (
						<>
							Questions about these terms and security reports:{" "}
							<EmailLink email={contactEmail} />
						</>
					) : (
						`Questions about these terms and security reports: ask ${operator ?? "whoever runs this instance"} directly.`
					)}
				</p>
			</LegalSection>
		</LegalPage>
	);
}
