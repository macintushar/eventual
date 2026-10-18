import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
	Body,
	Display,
	Field,
	FormMessage,
	GlassButton,
	Screen,
} from "../../components/brand";
import {
	HOSTED_ORIGIN,
	parseServerAddress,
	probeMessages,
	probeServer,
} from "../../lib/server";
import { useSession } from "../../lib/session";

export default function ServerSheet() {
	const router = useRouter();
	const { origin, chooseServer } = useSession();
	const [address, setAddress] = useState(origin);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const active = useRef<AbortController | null>(null);
	useEffect(() => () => active.current?.abort(), []);

	async function use(input: string) {
		const parsed = parseServerAddress(input);
		if (!parsed) {
			setError(
				__DEV__
					? "Enter an HTTPS server address, without a path. Plain HTTP only works for localhost."
					: "Enter an HTTPS server address, without a path.",
			);
			return;
		}
		setError("");
		setBusy(true);
		const controller = new AbortController();
		active.current = controller;
		const timeout = setTimeout(() => controller.abort(), 10_000);
		try {
			const result = await probeServer(parsed, controller.signal);
			if (!result.ok) return setError(probeMessages[result.reason]);
			await chooseServer(result.server);
			router.back();
		} catch {
			if (active.current === controller) setError(probeMessages.unreachable);
		} finally {
			clearTimeout(timeout);
			if (active.current === controller) active.current = null;
			setBusy(false);
		}
	}

	return (
		<Screen edges={[]} contentStyle={{ paddingTop: 28 }}>
			<View style={{ gap: 8 }}>
				<Display size={28}>Your server</Display>
				<Body tone="muted">
					Use hosted Eventual or your own instance. You’ll sign in to this
					server, and your groups stay on it.
				</Body>
			</View>
			<Field
				label="Server address"
				placeholder="eventual.example.com"
				value={address}
				onChangeText={(text) => {
					setAddress(text);
					setError("");
				}}
				keyboardType="url"
				autoCapitalize="none"
				autoCorrect={false}
				returnKeyType="go"
				editable={!busy}
				onSubmitEditing={() => void use(address)}
			/>
			{error ? <FormMessage>{error}</FormMessage> : null}
			<View style={{ gap: 12 }}>
				<GlassButton
					prominent
					label={busy ? "Checking…" : "Check and use"}
					busy={busy}
					onPress={() => void use(address)}
				/>
				{origin !== HOSTED_ORIGIN ? (
					<GlassButton
						label="Use hosted Eventual"
						disabled={busy}
						onPress={() => void use(HOSTED_ORIGIN)}
					/>
				) : null}
			</View>
		</Screen>
	);
}
