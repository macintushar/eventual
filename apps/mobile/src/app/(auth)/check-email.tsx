import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
	Screen,
} from "../../components/brand";
import { useSession } from "../../lib/session";

export default function CheckEmail() {
	const router = useRouter();
	const { email } = useLocalSearchParams<{ email: string }>();
	const { origin, auth } = useSession();
	const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">(
		"idle",
	);

	async function resend() {
		setState("sending");
		try {
			const result = await auth.sendVerificationEmail({
				email,
				callbackURL: `${origin}/verify-email`,
			});
			setState(result.error ? "failed" : "sent");
		} catch {
			setState("failed");
		}
	}

	return (
		<Screen edges={["left", "right"]}>
			<Card elevated>
				<View style={{ gap: 8 }}>
					<Display>Check your email</Display>
					<Body tone="muted">
						Verify{" "}
						<Body weight="semibold" tone="default">
							{email}
						</Body>{" "}
						to sign in.
					</Body>
				</View>
				<Body tone="muted">
					Open the verification link in your inbox. It expires after one hour.
					Check your spam folder if you don’t see it. Once you’ve verified, come
					back and log in.
				</Body>
				{state === "sent" ? (
					<FormMessage tone="positive">
						A verification email was sent.
					</FormMessage>
				) : state === "failed" ? (
					<FormMessage>
						Could not send the email. Wait a minute and try again.
					</FormMessage>
				) : null}
				<GlassButton
					prominent
					label="Back to log in"
					onPress={() => router.dismissTo("/sign-in")}
				/>
				<GlassButton
					label={state === "sending" ? "Sending…" : "Resend verification email"}
					busy={state === "sending"}
					disabled={state === "sent"}
					onPress={() => void resend()}
				/>
			</Card>
		</Screen>
	);
}
