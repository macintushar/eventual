import { Fragment } from "react";
import {
	Body,
	Button,
	Column,
	Container,
	Font,
	Head,
	Heading,
	Html,
	Link,
	Preview,
	pixelBasedPreset,
	Row,
	Section,
	Tailwind,
	Text,
} from "react-email";

export type EmailKind =
	| "verification"
	| "reset-password"
	| "password-changed"
	| "invitation"
	| "reminder";
type BaseEmailProps = {
	url: string;
	name?: string;
	/** When the link in this email stops working. Omitted for notices. */
	expiresAt?: Date;
};
export type TransactionalEmailProps = BaseEmailProps &
	(
		| { kind: "reminder"; groupName: string }
		| {
				kind: "verification" | "reset-password" | "password-changed";
		  }
		| {
				kind: "invitation";
				groupName: string;
				inviterName: string;
				inviteeRole: string;
		  }
	);

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

/*
 * Word-rendered Outlook honours no wrapping property at all — not
 * `overflow-wrap`, not `word-break`, not the legacy `word-wrap` — so a token
 * URL printed as one string pushes the card sideways there. Splitting the
 * visible text at the query separators gives every engine a real line break to
 * use instead. The href stays whole, and so does the URL in the plain-text
 * part, which `toPlainText` takes from the href rather than the label.
 */
function urlSegments(url: string) {
	return url.split(/(?=[?&])/g);
}

export function emailCopy(props: TransactionalEmailProps) {
	const { kind, expiresAt } = props;
	const deadline = expiresAt ? `on ${formatExpiry(expiresAt)}` : "in one hour";
	switch (kind) {
		case "reminder":
			return {
				subject: `A reminder to review ${props.groupName}`,
				preview: `Review your shared expenses in ${props.groupName}.`,
				kicker: "Group reminder",
				heading: "Time to check in",
				message: `Your group sent a reminder to review shared expenses in ${props.groupName}. Open the group to see the latest balances and settle up if needed.`,
				action: "Review group",
				note: "Balances shown in the app are always up to date.",
				footer:
					"You can turn off email reminders in your notification preferences.",
			};
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
		case "invitation":
			return {
				subject: `${props.inviterName} invited you to ${props.groupName}`,
				preview: `Join ${props.groupName} on Eventual.`,
				kicker: "Group invitation",
				heading: `Join ${props.groupName}`,
				message: `${props.inviterName} invited you to join ${props.groupName} as ${props.inviteeRole}. Accept the invitation to start sharing expenses with the group.`,
				action: "Accept invitation",
				note: "One group, no awkward maths.",
				footer: `This invitation expires ${deadline}. If you weren't expecting it, you can ignore this email.`,
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

/*
 * Webfonts reach Apple Mail and iOS; everywhere else falls back to a face the
 * machine already has. `Font` writes an @font-face plus an `mso-font-alt` hint
 * rather than a `<link>`, which Gmail, Outlook and Yahoo strip from the head.
 * Caveat falls back to script faces that ship with macOS and Windows, so the
 * note still reads as handwriting when the webfont never loads.
 */
const webFonts = [
	{
		fontFamily: "Inter Tight",
		fallback: "Helvetica" as const,
		weight: 500,
		url: "https://fonts.gstatic.com/s/intertight/v9/NGSnv5HMAFg6IuGlBNMjxJEL2VmU3NS7Z2mjPQ-aWy5SgqoUP_C5.woff2",
	},
	{
		fontFamily: "Caveat",
		fallback: "cursive" as const,
		weight: 400,
		url: "https://fonts.gstatic.com/s/caveat/v23/WnznHAc5bAfYB2QRah7pcpNvOx-pjfJ9eIWpYT5Kmgq3sw.woff2",
	},
	{
		fontFamily: "Instrument Sans",
		fallback: "Helvetica" as const,
		weight: 500,
		url: "https://fonts.gstatic.com/s/instrumentsans/v4/pxiTypc9vsFDm051Uf6KVwgkfoSxQ0GsQv8ToedPibnr0SZe1Q.woff2",
	},
	// Body weight last: `Font` also emits a `* { font-family }` rule, and the
	// final one wins for anything that somehow renders without its own family.
	{
		fontFamily: "Instrument Sans",
		fallback: "Helvetica" as const,
		weight: 400,
		url: "https://fonts.gstatic.com/s/instrumentsans/v4/pxiTypc9vsFDm051Uf6KVwgkfoSxQ0GsQv8ToedPibnr0SZe1Q.woff2",
	},
];

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
								sans: [
									"Instrument Sans",
									"Inter",
									"Helvetica",
									"Arial",
									"sans-serif",
								],
								display: [
									"Inter Tight",
									"Inter",
									"Helvetica",
									"Arial",
									"sans-serif",
								],
								// Bradley Hand ships with macOS, Segoe Script with Windows,
								// so the note keeps a script face wherever the webfont is
								// blocked. `mso-font-alt` can only name a generic family.
								hand: ["Caveat", "Bradley Hand", "Segoe Script", "cursive"],
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
					{webFonts.map((font) => (
						<Font
							key={`${font.fontFamily}-${font.weight}`}
							fontFamily={font.fontFamily}
							fallbackFontFamily={font.fallback}
							fontWeight={font.weight}
							webFont={{ url: font.url, format: "woff2" }}
						/>
					))}
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
							<Row>
								<Column width={28} style={{ verticalAlign: "middle" }}>
									{/*
									 * The strip is a nested table sized by width/height
									 * attributes: a lone `td` would stretch to the row, and
									 * Yahoo drops the CSS `height` property. Its own line
									 * height, not a CSS box, gives it its 8px.
									 */}
									<Row
										width={20}
										bgcolor={tape}
										style={{ borderRadius: "2px" }}
									>
										<Column
											height={8}
											style={{ fontSize: "1px", lineHeight: "8px" }}
										>
											&nbsp;
										</Column>
									</Row>
								</Column>
								<Column
									className="font-sans text-[14px] font-medium leading-[1.4]"
									style={{ color: mutedInk, verticalAlign: "middle" }}
								>
									{copy.kicker}
								</Column>
							</Row>

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
								className="mt-8 inline-block rounded-full px-7 py-[14px] text-center font-sans text-[15px] font-medium"
								style={{
									backgroundColor: ink,
									color: paper,
									boxShadow: shadowXs,
									// Shorthand: Outlook ignores the `text-decoration-line`
									// longhand and would underline the label inside the pill.
									textDecoration: "none",
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
									style={{
										color: mutedInk,
										textDecoration: "underline",
										textDecorationColor: tape,
									}}
								>
									{urlSegments(props.url).map((segment, index) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: segments of one string
										<Fragment key={index}>
											{index > 0 ? <br /> : null}
											{segment}
										</Fragment>
									))}
								</Link>
							</Text>
						</Section>

						{/* The one handwritten mark per screen: a sticky note by the card. */}
						<Section className="pt-6">
							<Row align="left" style={{ width: "auto" }}>
								<Column
									className="font-hand text-[20px] leading-[22px]"
									style={{
										backgroundColor: note,
										color: noteInk,
										padding: "14px 16px",
										// No rotation: transforms are dropped by Gmail, Outlook
										// and Yahoo. The peeled corner and the script face carry
										// the handmade feel instead.
										borderRadius: "3px 3px 10px 3px",
										boxShadow: shadowMd,
									}}
								>
									{copy.note}
								</Column>
							</Row>
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
