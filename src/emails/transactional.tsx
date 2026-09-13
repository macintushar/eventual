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
};

export function emailCopy({ kind }: TransactionalEmailProps) {
	switch (kind) {
		case "verification":
			return {
				subject: "Welcome to Eventual — verify your email",
				heading: "Welcome to Eventual",
				message:
					"Verify your email to confirm this account belongs to you. Then you're ready to share expenses and settle up together.",
				action: "Verify email",
				footer:
					"This link expires in one hour. If you didn't create an account, you can ignore this email.",
			};
		case "reset-password":
			return {
				subject: "Reset your Eventual password",
				heading: "Password reset",
				message:
					"We received a request to reset your password. Choose a new one using the link below.",
				action: "Reset password",
				footer:
					"This link expires in one hour and can only be used once. If you didn't request this, your password will stay the same.",
			};
		case "password-changed":
			return {
				subject: "Your Eventual password was changed",
				heading: "Password updated",
				message:
					"Your password was reset successfully and your previous sessions have been signed out. If this wasn't you, reset your password immediately.",
				action: "Secure your account",
				footer: "This is a security notification for your Eventual account.",
			};
	}
}

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
								sans: ["Arial", "sans-serif"],
								condensed: [
									"Arial Narrow",
									"Helvetica Neue",
									"Arial",
									"sans-serif",
								],
							},
						},
					},
				}}
			>
				<Head />
				<Body className="m-0 bg-[#212121] p-0 font-sans text-white">
					<Preview>{copy.subject}</Preview>
					<Container className="mx-auto w-full max-w-[640px] bg-[#131313]">
						<Section className="px-6 py-6">
							<Text className="m-0 text-xl font-bold tracking-tight">
								Eventual
							</Text>
						</Section>
						<Section className="px-6 pb-14 pt-16">
							<Heading
								as="h1"
								className="m-0 max-w-[490px] font-condensed text-[44px] font-medium leading-[46px] tracking-[-1.2px] uppercase"
							>
								{copy.heading}
							</Heading>
							{props.name ? (
								<Text className="mb-0 mt-8 text-sm leading-[22px] text-[#C4C4C4]">
									Hi {props.name},
								</Text>
							) : null}
							<Text
								className={`${props.name ? "mt-3" : "mt-8"} mb-0 text-sm leading-[22px] text-[#C4C4C4]`}
							>
								{copy.message}
							</Text>
							<Button
								href={props.url}
								className="box-border mt-10 inline-block bg-white px-5 py-[14px] text-center text-[15px] font-medium text-[#131313] no-underline"
							>
								{copy.action}
							</Button>
							<Text className="mb-0 mt-6 text-[13px] leading-5 text-[#A3A3A3]">
								{copy.footer}
							</Text>
							<Text className="mb-0 mt-6 text-xs leading-5 text-[#A3A3A3]">
								Or copy this link into your browser:
								<br />
								<Link
									href={props.url}
									className="break-all text-[#C4C4C4] underline"
									style={{ overflowWrap: "anywhere", wordBreak: "break-all" }}
								>
									{props.url}
								</Link>
							</Text>
						</Section>
						<Section className="border-0 border-t border-solid border-[#2B2B2B] px-6 py-10">
							<Text className="m-0 max-w-[320px] text-[13px] leading-5 text-[#C4C4C4]">
								Shared expenses. Clear balances.
								<br />
								Settle up with Eventual.
							</Text>
							<Text className="mb-0 mt-6 text-[11px] leading-[17px] text-[#A3A3A3]">
								An account notification from Eventual.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

// Visual reference: Resend's Protocol activation and password-reset templates.
// https://github.com/resend/react-email/tree/canary/apps/demo/emails/03-Protocol

TransactionalEmail.PreviewProps = {
	kind: "verification",
	url: "https://example.com/api/auth/verify-email?token=preview",
	name: "Mac",
} satisfies TransactionalEmailProps;
