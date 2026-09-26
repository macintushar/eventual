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

export const Route = createFileRoute("/privacy")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(legalQueryOptions),
	head: () => ({
		meta: [
			{ title: "Privacy policy · Eventual" },
			{
				name: "description",
				content: "What Eventual collects, why, and who can see it.",
			},
		],
		links: [{ rel: "canonical", href: `${SITE_URL}/privacy` }],
	}),
	component: PrivacyPolicy,
});

function PrivacyPolicy() {
	const { operator, contactEmail, dataLocation, origin, processors } =
		useSuspenseQuery(legalQueryOptions).data;
	const usesPostHog = processors.some(
		(processor) => processor.name === "PostHog",
	);

	return (
		<LegalPage
			kicker="Privacy"
			title="Privacy policy"
			url={`${origin}/privacy`}
			lede={<p>What Eventual collects, why, and who can see it.</p>}
		>
			<LegalSection id="who" title="Who runs this">
				<p>
					{operator
						? `Eventual at ${origin} is run by ${operator}. "We" means ${operator}.`
						: `Eventual is open-source software, and this copy at ${origin} is run independently by whoever set it up. "We" means them, not the Eventual project, which can't see data on copies it doesn't run.`}{" "}
					The code is public at <a href={SOURCE_URL}>{SOURCE_URL}</a>, so you
					can check exactly what it stores and sends.
				</p>
			</LegalSection>

			<LegalSection id="account" title="Your account">
				<LegalList>
					<li>Your name and email address</li>
					<li>Your password, stored only as a salted hash</li>
					<li>
						If you use Google sign-in: your Google account ID, name, email,
						profile photo, and the sign-in tokens Google issues
					</li>
					<li>
						A UPI ID or Wise tag, if you add one, so people can pay you back
					</li>
				</LegalList>
				<p>
					We do not collect bank details, card numbers or payment credentials.
				</p>
			</LegalSection>

			<LegalSection id="groups" title="What you log">
				<LegalList>
					<li>Groups, their members and roles, and invitations</li>
					<li>
						Expenses: description, amount, currency, date, category, notes, who
						paid and how it's split
					</li>
					<li>Repayments, recurring expenses and reminders</li>
					<li>The activity history built from all of the above</li>
				</LegalList>
				<p>
					When you invite someone or add them as a guest, you give us their name
					and, if you enter it, their email address. Only add people who'd
					expect to be in the group.
				</p>
			</LegalSection>

			<LegalSection id="technical" title="Sessions and security">
				<p>
					Each signed-in session stores your IP address, browser user agent and
					expiry time. IP addresses also rate-limit sign-in and password-reset
					requests. API keys are stored as hashes, never in full. Our host keeps
					standard request logs. If a breach affects your data, we'll tell you
					and the relevant authorities as the law requires.
				</p>
			</LegalSection>

			<LegalSection id="analytics" title="Errors and analytics">
				{processors.some((processor) => processor.name === "Sentry") ? (
					<p>
						Crash reports go to Sentry with request bodies, cookies and API keys
						stripped out. Screen recordings are only kept for sessions that hit
						an error, with all text masked.
					</p>
				) : null}
				{usesPostHog ? (
					<p>
						PostHog counts page views and which features are used, against your
						account ID. It stores an anonymous identifier in a cookie so repeat
						visits count once.
					</p>
				) : null}
				<p>
					Amounts, descriptions, group names and other transaction details are
					never sent to analytics or error tools. The only other cookie is the
					one that keeps you signed in.
				</p>
			</LegalSection>

			<LegalSection id="use" title="How it's used">
				<p>
					To sign you in, work out splits and balances, send account emails
					(verification and password resets), stop abuse, and fix bugs. We do
					not sell your data, show ads, make credit decisions, or train AI
					models on your expenses.
				</p>
				<p>
					Under laws like the GDPR, running the app relies on our agreement with
					you, and security, debugging and usage counts on our legitimate
					interests. Where the law relies on consent, such as India's Digital
					Personal Data Protection Act, you give it by creating an account, and
					you can withdraw it at any time by asking us to delete your account.
				</p>
			</LegalSection>

			<LegalSection id="share" title="Who can see it">
				<p>
					People in your groups see your name, email, profile photo and payment
					handles, and everything logged in that group. Nothing is public.
				</p>
				<p>
					Apps you give an API key to, like an AI assistant or the Apple
					Shortcut, can read and change your groups as you. Their own privacy
					policies cover what they do with it.
				</p>
			</LegalSection>

			<LegalSection id="providers" title="Service providers">
				{processors.length > 0 ? (
					<LegalList>
						{processors.map((processor) => (
							<li key={processor.name}>
								<a href={processor.privacyUrl}>{processor.name}</a>
								{processor.location ? ` (${processor.location})` : null}:{" "}
								{processor.purpose}
							</li>
						))}
					</LegalList>
				) : (
					<p>None. Everything stays on the servers this instance runs on.</p>
				)}
				<p>
					{dataLocation ? `Your data is stored in ${dataLocation}. ` : null}
					Providers in other countries process it under safeguards such as
					standard contractual clauses. We may also disclose data when the law
					requires it.
				</p>
			</LegalSection>

			<LegalSection id="retention" title="Keeping and deleting data">
				<LegalList>
					<li>Your account stays until you ask us to delete it.</li>
					<li>
						Deleting a group deletes its expenses, repayments and history.
					</li>
					<li>
						Expenses you share with others stay in their groups after you leave,
						with your name on them, so their balances still add up.
					</li>
					<li>
						Sessions expire after a week unused. Email links expire after an
						hour.
					</li>
					<li>
						Logs, error reports and analytics expire within about 90 days.
					</li>
				</LegalList>
			</LegalSection>

			<LegalSection id="rights" title="Your rights">
				<p>
					Edit your profile and payment handles, or disconnect Google, in{" "}
					<Link to="/app/settings/profile">Settings</Link>. Export your data
					through the API. Depending on where you live, you can also ask us to
					access, correct or delete your data, withdraw consent, or nominate
					someone to act for you if you die or can't act yourself. We'll reply
					within 30 days. If we don't resolve a complaint, you can take it to
					your data protection authority, such as the Data Protection Board of
					India.
				</p>
			</LegalSection>

			<LegalSection id="children" title="Children">
				<p>
					Eventual is for people 18 and over. If a child has signed up, tell us
					and we'll delete the account.
				</p>
			</LegalSection>

			<LegalSection id="changes" title="Changes">
				<p>
					We'll update the date at the top when this changes, and tell you by
					email or in the app before significant changes take effect.
				</p>
			</LegalSection>

			<LegalSection id="contact" title="Contact">
				<p>
					{contactEmail ? (
						<>
							Privacy questions and data deletion requests:{" "}
							<EmailLink email={contactEmail} />
						</>
					) : (
						`Privacy questions and data deletion requests: ask ${operator ?? "whoever runs this instance"} directly, from the email address on your account.`
					)}
				</p>
			</LegalSection>
		</LegalPage>
	);
}
