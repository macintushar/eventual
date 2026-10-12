import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput, View } from "react-native";
import {
	Body,
	Card,
	Display,
	Field,
	FormMessage,
	GlassButton,
	Screen,
	TextLink,
} from "../../components/brand";
import { PendingInviteNotice } from "../../components/pending-invite-handoff";
import { ServerRow } from "../../components/server-row";
import { SocialSignIn } from "../../components/social-sign-in";
import { useSession } from "../../lib/session";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
	const router = useRouter();
	const { auth, refreshSession } = useSession();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const passwordInput = useRef<TextInput>(null);
	const [busy, setBusy] = useState(false);
	const [socialBusy, setSocialBusy] = useState(false);
	const [error, setError] = useState("");

	async function signIn() {
		if (busy || socialBusy) return;
		const address = email.trim().toLowerCase();
		if (!EMAIL.test(address)) return setError("Enter a valid email address");
		if (!password) return setError("Enter your password");
		setError("");
		setBusy(true);
		try {
			const result = await auth.signIn.email({ email: address, password });
			if (result.error) {
				if (result.error.code === "EMAIL_NOT_VERIFIED")
					router.push({ pathname: "/check-email", params: { email: address } });
				else
					setError(
						result.error.status === 401
							? "Could not sign in with those credentials."
							: (result.error.message ?? "Authentication failed"),
					);
				return;
			}
			await refreshSession();
		} catch {
			setError(
				"Couldn’t reach the server. Check your connection and try again.",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Screen masthead>
			<Card elevated>
				<View style={{ gap: 8 }}>
					<Display>Welcome back</Display>
					<Body tone="muted">Sign in to see your groups and balances.</Body>
					<PendingInviteNotice action="Log in" />
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
					returnKeyType="next"
					submitBehavior="submit"
					editable={!busy}
					onSubmitEditing={() => passwordInput.current?.focus()}
				/>
				<Field
					ref={passwordInput}
					label="Password"
					value={password}
					onChangeText={setPassword}
					secureTextEntry
					autoComplete="current-password"
					textContentType="password"
					returnKeyType="go"
					editable={!busy}
					onSubmitEditing={() => void signIn()}
				/>
				<TextLink
					center
					onPress={() =>
						router.push({
							pathname: "/forgot-password",
							params: email.trim() ? { email: email.trim() } : {},
						})
					}
				>
					Forgot your password?
				</TextLink>
				<GlassButton
					prominent
					label={busy ? "Please wait…" : "Log in"}
					busy={busy}
					disabled={socialBusy}
					onPress={() => void signIn()}
				/>
				{error ? <FormMessage>{error}</FormMessage> : null}
				<SocialSignIn busy={busy || socialBusy} onBusyChange={setSocialBusy} />
				<View
					style={{
						flexDirection: "row",
						justifyContent: "center",
						alignItems: "center",
						gap: 6,
					}}
				>
					<Body tone="muted">New here?</Body>
					<TextLink onPress={() => router.push("/sign-up")}>
						Create an account
					</TextLink>
				</View>
			</Card>
			<ServerRow />
		</Screen>
	);
}
