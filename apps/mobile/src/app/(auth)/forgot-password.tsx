import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
	Body,
	Card,
	Display,
	Field,
	FormMessage,
	GlassButton,
	Screen,
} from "../../components/brand";
import { RESET_PASSWORD_URL } from "../../lib/linking";
import { useSession } from "../../lib/session";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
	const router = useRouter();
	const params = useLocalSearchParams<{ email?: string }>();
	const { auth } = useSession();
	const [email, setEmail] = useState(params.email ?? "");
	const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
	const [error, setError] = useState("");

	async function send() {
		if (state === "sending") return;
		const address = email.trim().toLowerCase();
		if (!EMAIL.test(address)) return setError("Enter a valid email address");
		setError("");
		setState("sending");
		try {
			// The emailed link comes back through the server to this deep link,
			// carrying the one-time token.
			const result = await auth.requestPasswordReset({
				email: address,
				redirectTo: RESET_PASSWORD_URL,
			});
			if (result.error) {
				setError(
					result.error.status === 429
						? "Too many requests. Wait a minute and try again."
						: "Couldn’t send the email. Try again in a moment.",
				);
				setState("idle");
				return;
			}
			setState("sent");
		} catch {
			setError(
				"Couldn’t reach the server. Check your connection and try again.",
			);
			setState("idle");
		}
	}

	if (state === "sent")
		return (
			<Screen edges={["left", "right"]}>
				<Card elevated>
					<View style={{ gap: 8 }}>
						<Display>Check your email</Display>
						<Body tone="muted">
							If an account exists for {email.trim()}, a reset link is on its
							way. Open it on this phone. It expires in an hour.
						</Body>
					</View>
					<GlassButton
						prominent
						label="Back to log in"
						onPress={() => router.dismissTo("/sign-in")}
					/>
					<GlassButton
						label="Use another email"
						onPress={() => setState("idle")}
					/>
				</Card>
			</Screen>
		);

	return (
		<Screen edges={["left", "right"]}>
			<Card elevated>
				<View style={{ gap: 8 }}>
					<Display>Reset password</Display>
					<Body tone="muted">We’ll email you a link to choose a new one.</Body>
				</View>
				<Field
					label="Email"
					placeholder="you@example.com"
					value={email}
					onChangeText={setEmail}
					keyboardType="email-address"
					autoCapitalize="none"
					autoCorrect={false}
					autoComplete="email"
					textContentType="username"
					returnKeyType="go"
					editable={state !== "sending"}
					onSubmitEditing={() => void send()}
				/>
				<GlassButton
					prominent
					label={state === "sending" ? "Please wait…" : "Send reset link"}
					busy={state === "sending"}
					onPress={() => void send()}
				/>
				{error ? <FormMessage>{error}</FormMessage> : null}
			</Card>
		</Screen>
	);
}
