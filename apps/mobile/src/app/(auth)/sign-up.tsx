import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
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
import { SocialSignIn } from "../../components/social-sign-in";
import { useSession } from "../../lib/session";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUp() {
	const router = useRouter();
	const { origin, auth, refreshSession } = useSession();
	const [values, setValues] = useState({ name: "", email: "", password: "" });
	const emailInput = useRef<TextInput>(null);
	const passwordInput = useRef<TextInput>(null);
	const [busy, setBusy] = useState(false);
	const [socialBusy, setSocialBusy] = useState(false);
	const [error, setError] = useState("");
	const [claimable, setClaimable] = useState(false);
	const set = (key: keyof typeof values) => (text: string) =>
		setValues((current) => ({ ...current, [key]: text }));

	function invalid() {
		if (values.name.trim().length < 2)
			return "Name must be at least 2 characters";
		if (!EMAIL.test(values.email.trim())) return "Enter a valid email address";
		if (values.password.length < 8)
			return "Password must be at least 8 characters";
		return "";
	}

	async function signUp() {
		if (busy || socialBusy) return;
		const problem = invalid();
		setError(problem);
		setClaimable(false);
		if (problem) return;
		const name = values.name.trim();
		const email = values.email.trim().toLowerCase();
		const { password } = values;
		setBusy(true);
		try {
			const result = await auth.signUp.email({
				name,
				email,
				password,
				// An absolute URL, so the link opens the web app rather than a deep
				// link: verifying happens in the browser either way.
				callbackURL: `${origin}/verify-email`,
			});
			if (result.error) {
				setError(result.error.message ?? "Authentication failed");
				setClaimable(
					result.error.code === "GUEST_CLAIM_REQUIRED" ||
						Boolean(
							result.error.message?.toLowerCase().includes("guest claim"),
						),
				);
				return;
			}
			if (!result.data?.token) {
				// Better Auth answers the same for an existing address. Only a
				// successful password check can show the pending-verification step.
				const signIn = await auth.signIn.email({ email, password });
				if (signIn.error?.code === "EMAIL_NOT_VERIFIED") {
					router.replace({ pathname: "/check-email", params: { email } });
					return;
				}
				if (signIn.error) {
					setError("Could not sign in with those credentials.");
					return;
				}
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

	const open = (path: string) =>
		void WebBrowser.openBrowserAsync(`${origin}${path}`);

	return (
		<Screen edges={["left", "right"]}>
			<Card elevated>
				<View style={{ gap: 8 }}>
					<Display>Start splitting</Display>
					<Body tone="muted">Create an account in under a minute.</Body>
					<PendingInviteNotice action="Sign up" />
				</View>
				<Field
					label="Name"
					placeholder="Your name"
					value={values.name}
					onChangeText={set("name")}
					autoCapitalize="words"
					autoComplete="name"
					textContentType="name"
					returnKeyType="next"
					submitBehavior="submit"
					editable={!busy}
					onSubmitEditing={() => emailInput.current?.focus()}
				/>
				<Field
					ref={emailInput}
					label="Email"
					placeholder="you@example.com"
					value={values.email}
					onChangeText={set("email")}
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
					placeholder="At least 8 characters"
					value={values.password}
					onChangeText={set("password")}
					secureTextEntry
					autoComplete="new-password"
					textContentType="newPassword"
					returnKeyType="go"
					editable={!busy}
					onSubmitEditing={() => void signUp()}
				/>
				<GlassButton
					prominent
					label={busy ? "Please wait…" : "Create account"}
					busy={busy}
					disabled={socialBusy}
					onPress={() => void signUp()}
				/>
				{error ? <FormMessage>{error}</FormMessage> : null}
				{claimable ? (
					<TextLink onPress={() => open("/claim-guest")}>
						Claim your guest profile
					</TextLink>
				) : null}
				<SocialSignIn busy={busy || socialBusy} onBusyChange={setSocialBusy} />
				<View
					style={{
						flexDirection: "row",
						justifyContent: "center",
						alignItems: "center",
						gap: 6,
					}}
				>
					<Body tone="muted">Already registered?</Body>
					<TextLink onPress={() => router.back()}>Log in</TextLink>
				</View>
			</Card>
			<View
				style={{
					flexDirection: "row",
					flexWrap: "wrap",
					justifyContent: "center",
					alignItems: "center",
					columnGap: 6,
				}}
			>
				<Body tone="muted" size={14}>
					By creating an account, you agree to the
				</Body>
				<TextLink onPress={() => open("/terms")}>Terms</TextLink>
				<Body tone="muted" size={14}>
					and
				</Body>
				<TextLink onPress={() => open("/privacy")}>Privacy policy</TextLink>
			</View>
		</Screen>
	);
}
