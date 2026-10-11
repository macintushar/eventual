import * as AppleAuthentication from "expo-apple-authentication";
import { useState } from "react";
import { Platform, useColorScheme, View } from "react-native";
import { useSession } from "../lib/session";
import { Divider, FormMessage, GlassButton, GoogleMark } from "./brand";

/**
 * Apple and Google sign-in. Shown only when the server offers Google: the
 * App Store asks for Sign in with Apple wherever another social sign-in is
 * offered, and a server without Google has no social sign-in at all. The
 * Apple button itself also needs the server to have Apple configured.
 */
export function SocialSignIn({
	busy,
	onBusyChange,
}: {
	busy: boolean;
	onBusyChange: (busy: boolean) => void;
}) {
	const scheme = useColorScheme();
	const { site, auth, refreshSession } = useSession();
	const [pending, setPending] = useState<"apple" | "google" | null>(null);
	const [error, setError] = useState("");
	if (!site?.googleSignIn) return null;

	async function run(provider: "apple" | "google", go: () => Promise<void>) {
		if (busy) return;
		setError("");
		setPending(provider);
		onBusyChange(true);
		try {
			await go();
		} finally {
			setPending(null);
			onBusyChange(false);
		}
	}

	const google = () =>
		run("google", async () => {
			try {
				// Opens the server's Google sign-in in a browser sheet; the server
				// hands the session back through the `eventual://` link.
				const result = await auth.signIn.social({
					provider: "google",
					callbackURL: "/",
				});
				if (result.error)
					setError(result.error.message ?? "Could not continue with Google");
				await refreshSession();
			} catch {
				setError("Could not continue with Google");
			}
		});

	const apple = () =>
		run("apple", async () => {
			let token: string | null;
			try {
				const credential = await AppleAuthentication.signInAsync({
					requestedScopes: [
						AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
						AppleAuthentication.AppleAuthenticationScope.EMAIL,
					],
				});
				token = credential.identityToken;
			} catch (cause) {
				if ((cause as { code?: string }).code !== "ERR_REQUEST_CANCELED")
					setError("Could not continue with Apple");
				return;
			}
			if (!token) return setError("Could not continue with Apple");
			try {
				const result = await auth.signIn.social({
					provider: "apple",
					idToken: { token },
				});
				if (result.error) {
					// Until the server registers Apple as a provider it answers
					// "provider not found".
					setError(
						result.error.status === 404 ||
							/provider/i.test(result.error.message ?? "")
							? "Sign in with Apple isn’t set up on this server yet."
							: (result.error.message ?? "Could not continue with Apple"),
					);
					return;
				}
				await refreshSession();
			} catch {
				setError("Could not continue with Apple");
			}
		});

	return (
		<View style={{ gap: 12 }}>
			<Divider label="Or continue with" />
			{/* Apple only where the server registered it; older servers omit the flag. */}
			{Platform.OS === "ios" && site.appleSignIn === true ? (
				<AppleAuthentication.AppleAuthenticationButton
					buttonType={
						AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
					}
					buttonStyle={
						scheme === "dark"
							? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
							: AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
					}
					cornerRadius={26}
					style={{ height: 52, opacity: busy && pending !== "apple" ? 0.5 : 1 }}
					onPress={() => void apple()}
				/>
			) : null}
			<GlassButton
				label={pending === "google" ? "Connecting…" : "Continue with Google"}
				icon={<GoogleMark />}
				disabled={busy}
				onPress={() => void google()}
			/>
			{error ? <FormMessage>{error}</FormMessage> : null}
		</View>
	);
}
