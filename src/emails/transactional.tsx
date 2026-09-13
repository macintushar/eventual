import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Html,
	Link,
	Preview,
	pixelBasedPreset,
	Section,
	Tailwind,
	Text,
} from "react-email";

export type EmailKind = "verification" | "reset-password" | "password-changed";
export type TransactionalEmailProps = {
	kind: EmailKind;
	url: string;
	name?: string;
	/** When the link in this email stops working. Omitted for notices. */
	expiresAt?: Date;
};

/*
 * Accounts carry no timezone, so the deadline is stamped in UTC rather than
 * guessed from the sender's clock. An absolute time also stays correct in a
 * mailbox read days later, which "in one hour" does not.
 */
function formatExpiry(expiresAt: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "UTC",
		timeZoneName: "short",
	}).format(expiresAt);
}

export function emailCopy({ kind, expiresAt }: TransactionalEmailProps) {
	const deadline = expiresAt ? `on ${formatExpiry(expiresAt)}` : "in one hour";
	switch (kind) {
		case "verification":
			return {
				subject: "Welcome to Eventual — verify your email",
				preview: "One tap to confirm your address and start splitting.",
				kicker: "New account",
				heading: "Welcome to Eventual",
				message:
					"Verify your email to confirm this account belongs to you. Then you're ready to share expenses and settle up together.",
				action: "Verify email",
				note: "Then go add your first group.",
				footer: `This link expires ${deadline}. If you didn't create an account, you can ignore this email.`,
			};
		case "reset-password":
			return {
				subject: "Reset your Eventual password",
				preview: "Choose a new password — the link is good for an hour.",
				kicker: "Account security",
				heading: "Password reset",
				message:
					"We received a request to reset your password. Choose a new one using the link below.",
				action: "Reset password",
				note: "Good for one hour, once.",
				footer: `This link expires ${deadline} and can only be used once. If you didn't request this, your password will stay the same.`,
			};
		case "password-changed":
			return {
				subject: "Your Eventual password was changed",
				preview: "Your password changed and other sessions were signed out.",
				kicker: "Security notice",
				heading: "Password updated",
				message:
					"Your password was reset successfully and your previous sessions have been signed out. If this wasn't you, reset your password immediately.",
				action: "Secure your account",
				note: "Wasn't you? Reset it now.",
				footer: "This is a security notification for your Eventual account.",
			};
	}
}

/*
 * Design tokens from DESIGN.md, hard-coded because email clients don't read
 * `src/styles.css`. Translucent props are pre-blended onto white: email has no
 * `color-mix()`, and Outlook drops rgba fills.
 */
const canvas = "#F3F6F9";
const paper = "#FFFFFF";
const ink = "#000000";
const mutedInk = "#46403F";
const hairline = "#DBD8D6";
const tape = "#6BB6E6"; // accent-blue at 75% over paper
const note = "#F3E37A";
const noteInk = "#2B2605";

// Soft, directional desk shadows. Ignored outside Apple Mail; nothing depends
// on them, the hairline borders carry the structure everywhere else.
const shadowMd =
	"0 2px 4px rgba(38, 34, 30, 0.05), 0 14px 28px -10px rgba(38, 34, 30, 0.18)";
const shadowXs = "0 1px 2px rgba(38, 34, 30, 0.06)";

export default function TransactionalEmail(props: TransactionalEmailProps) {
	const copy = emailCopy(props);
	return (
		<Html lang="en">
			<Tailwind
				config={{
					presets: [pixelBasedPreset],
					theme: {
						extend: {
							fontFamily: {
								sans: ["Inter", "Helvetica", "Arial", "sans-serif"],
								display: [
									"Inter Tight",
									"Inter",
									"Helvetica",
									"Arial",
									"sans-serif",
								],
								hand: ["Caveat", "Bradley Hand", "cursive"],
							},
						},
					},
				}}
			>
				<Head>
					{/*
					 * The app has a dark mode, but a mail client's auto-invert can't be
					 * steered towards it, so the paper look is pinned to light and the
					 * palette is chosen to survive a forced inversion.
					 */}
					<meta name="color-scheme" content="light" />
					<meta name="supported-color-schemes" content="light" />
					{/* Apple Mail and iOS honour this; everywhere else falls back to Helvetica. */}
					<link
						rel="stylesheet"
						href="https://fonts.googleapis.com/css2?family=Caveat:wght@400&family=Inter+Tight:wght@500&family=Inter:wght@400;500&display=swap"
					/>
				</Head>
				<Body
					className="m-0 p-0 font-sans"
					style={{ backgroundColor: canvas, color: ink }}
				>
					<Preview>{copy.preview}</Preview>
					<Container className="mx-auto w-full max-w-[600px] px-6 py-10">
						{/* Masthead: slim, the wordmark only, so the page title leads. */}
						<Section className="pb-5">
							<Text
								className="m-0 font-display text-[20px] font-medium tracking-[-0.02em]"
								style={{ color: ink }}
							>
								Eventual
							</Text>
						</Section>

						{/* Paper card on the canvas — the email's `.island-shell`. */}
						<Section
							className="rounded-[18px] border border-solid px-8 py-10"
							style={{
								backgroundColor: paper,
								borderColor: hairline,
								boxShadow: shadowMd,
							}}
						>
							{/* `.island-kicker`: a strip of blue tape, then a quiet label. */}
							<table
								role="presentation"
								cellPadding={0}
								cellSpacing={0}
								border={0}
								style={{ width: "auto", borderCollapse: "collapse" }}
							>
								<tbody>
									<tr>
										<td
											style={{
												verticalAlign: "middle",
												fontSize: 0,
												lineHeight: 0,
											}}
										>
											{/* The strip lives in a div: a `td` stretches to the row height. */}
											<div
												style={{
													width: "20px",
													height: "8px",
													backgroundColor: tape,
													borderRadius: "2px",
													transform: "rotate(-4deg)",
												}}
											/>
										</td>
										<td
											className="pl-2 font-sans text-[14px] font-medium leading-[1.4]"
											style={{ color: mutedInk, verticalAlign: "middle" }}
										>
											{copy.kicker}
										</td>
									</tr>
								</tbody>
							</table>

							<Heading
								as="h1"
								className="m-0 mt-5 max-w-[420px] font-display text-[36px] font-medium leading-[38px] tracking-[-1.26px]"
								style={{ color: ink }}
							>
								{copy.heading}
							</Heading>

							{props.name ? (
								<Text
									className="mb-0 mt-7 font-sans text-[16px] leading-[24px]"
									style={{ color: mutedInk }}
								>
									Hi {props.name},
								</Text>
							) : null}
							<Text
								className={`${props.name ? "mt-2" : "mt-7"} mb-0 max-w-[440px] font-sans text-[16px] leading-[24px]`}
								style={{ color: mutedInk }}
							>
								{copy.message}
							</Text>

							{/* Primary action: the same black pill used across the app. */}
							<Button
								href={props.url}
								className="mt-8 box-border inline-block rounded-full px-7 py-[14px] text-center font-sans text-[15px] font-medium no-underline"
								style={{
									backgroundColor: ink,
									color: paper,
									boxShadow: shadowXs,
								}}
							>
								{copy.action}
							</Button>

							<Text
								className="mb-0 mt-7 max-w-[440px] font-sans text-[14px] leading-[20px]"
								style={{ color: mutedInk }}
							>
								{copy.footer}
							</Text>
							<Text
								className="mb-0 mt-5 font-sans text-[13px] leading-[20px]"
								style={{ color: mutedInk }}
							>
								Or copy this link into your browser:
								<br />
								<Link
									href={props.url}
									className="break-all underline"
									style={{
										color: mutedInk,
										textDecorationColor: tape,
										overflowWrap: "anywhere",
										wordBreak: "break-all",
									}}
								>
									{props.url}
								</Link>
							</Text>
						</Section>

						{/* The one handwritten mark per screen: a sticky note by the card. */}
						<Section className="pt-6">
							<table
								role="presentation"
								cellPadding={0}
								cellSpacing={0}
								border={0}
								style={{ width: "auto", borderCollapse: "collapse" }}
							>
								<tbody>
									<tr>
										<td
											className="font-hand text-[20px] leading-[22px]"
											style={{
												backgroundColor: note,
												color: noteInk,
												padding: "14px 16px",
												borderRadius: "3px 3px 10px 3px",
												boxShadow: shadowMd,
												transform: "rotate(-2.5deg)",
											}}
										>
											{copy.note}
										</td>
									</tr>
								</tbody>
							</table>
						</Section>

						{/* Footer sits on the bare canvas, quieter than the paper above it. */}
						<Section className="pt-9">
							<Text
								className="m-0 max-w-[320px] font-sans text-[14px] leading-[20px]"
								style={{ color: mutedInk }}
							>
								Shared expenses. Clear balances.
								<br />
								Settle up with Eventual.
							</Text>
							<Text
								className="mb-0 mt-5 font-sans text-[12px] leading-[18px]"
								style={{ color: mutedInk }}
							>
								An account notification from Eventual.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

TransactionalEmail.PreviewProps = {
	kind: "verification",
	url: "https://example.com/api/auth/verify-email?token=preview",
	name: "Mac",
	expiresAt: new Date("2026-09-13T10:34:00Z"),
} satisfies TransactionalEmailProps;
