import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useSession } from "../../lib/session";

/**
 * Reached from the emailed link: the server checks the token, then redirects
 * to `eventual://reset-password?token=…` (or `?error=INVALID_TOKEN`).
 */
export default function ResetPassword() {
	const router = useRouter();
	const { token, error: linkError } = useLocalSearchParams<{
		token?: string;
		error?: string;
	}>();
	const { auth } = useSession();
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const confirmInput = useRef<TextInput>(null);
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState("");
	const [expired, setExpired] = useState(false);

	async function save() {
		if (busy || !token) return;
		if (password.length < 8)
			return setError("Password must be at least 8 characters");
		if (password.length > 128)
			return setError("Password must be at most 128 characters");
		if (password !== confirmation) return setError("Passwords don’t match");
		setError("");
		setBusy(true);
		try {
			const result = await auth.resetPassword({ newPassword: password, token });
			if (result.error) {
				// A bad token is the usual cause, and the only one worth acting on.
				setExpired(true);
				setError(
					"This link may have expired or already been used. Request a new one.",
				);
				return;
			}
			setDone(true);
		} catch {
			setError(
				"Couldn’t reach the server. Check your connection and try again.",
			);
		} finally {
			setBusy(false);
		}
	}

	if (!token || linkError)
		return (
			<Screen edges={["left", "right"]}>
				<Card elevated>
					<View style={{ gap: 8 }}>
						<Display>Link expired</Display>
						<Body tone="muted">
							This reset link is invalid or has already been used.
						</Body>
					</View>
					<GlassButton
						prominent
						label="Request a new link"
						onPress={() => router.replace("/forgot-password")}
					/>
					<GlassButton
						label="Back to log in"
						onPress={() => router.dismissTo("/sign-in")}
					/>
				</Card>
			</Screen>
		);

	if (done)
		return (
			<Screen edges={["left", "right"]}>
				<Card elevated>
					<View style={{ gap: 8 }}>
						<Display>Password updated</Display>
						<Body tone="muted">
							Log in with your new password. Other devices are signed out.
						</Body>
					</View>
					<GlassButton
						prominent
						label="Log in"
						onPress={() => router.dismissTo("/sign-in")}
					/>
				</Card>
			</Screen>
		);

	return (
		<Screen edges={["left", "right"]}>
			<Card elevated>
				<View style={{ gap: 8 }}>
					<Display>New password</Display>
					<Body tone="muted">Use at least 8 characters.</Body>
				</View>
				<Field
					label="New password"
					value={password}
					onChangeText={setPassword}
					secureTextEntry
					autoComplete="new-password"
					textContentType="newPassword"
					returnKeyType="next"
					submitBehavior="submit"
					editable={!busy}
					onSubmitEditing={() => confirmInput.current?.focus()}
				/>
				<Field
					ref={confirmInput}
					label="Confirm password"
					value={confirmation}
					onChangeText={setConfirmation}
					secureTextEntry
					autoComplete="new-password"
					textContentType="newPassword"
					returnKeyType="go"
					editable={!busy}
					onSubmitEditing={() => void save()}
				/>
				<GlassButton
					prominent
					label={busy ? "Please wait…" : "Update password"}
					busy={busy}
					onPress={() => void save()}
				/>
				{error ? <FormMessage>{error}</FormMessage> : null}
				{expired ? (
					<TextLink onPress={() => router.replace("/forgot-password")}>
						Request a new link
					</TextLink>
				) : null}
			</Card>
		</Screen>
	);
}
