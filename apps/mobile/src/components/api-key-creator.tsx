import {
	keyScopeResources,
	type Permissions,
	statement,
} from "@eventual/schemas/permissions";
import * as Clipboard from "expo-clipboard";
import * as ScreenCapture from "expo-screen-capture";
import { useEffect, useRef, useState } from "react";
import {
	Alert,
	AppState,
	Modal,
	Platform,
	Pressable,
	Switch,
	View,
} from "react-native";
import {
	createKeyInput,
	defaultKeyPermissions,
	expiryChoices,
	type KeyExpiry,
	type KeyMode,
	keyModeLabels,
	keyProtectionLease,
	OneTimeKeySecret,
} from "../lib/api-key-policy";
import { useApi } from "../lib/session";
import { useTheme } from "../theme";
import {
	Body,
	Card,
	Display,
	Field,
	FormMessage,
	GlassButton,
	Screen,
} from "./brand";

const modes: { value: KeyMode; description: string }[] = [
	{
		value: "transactional",
		description:
			"Recommended. Read groups, record and edit expenses, settle up. Can’t delete anything or change members.",
	},
	{
		value: "management",
		description:
			"Create and delete groups, manage members and expenses. Group roles still apply.",
	},
	{
		value: "custom",
		description: "Pick exactly which actions this key can take.",
	},
	{
		value: "full",
		description:
			"Dangerous. Acts as you, including your profile and group settings. Only for tools you fully trust. Must expire within 90 days.",
	},
];
const actionLabels: Record<string, string> = {
	read: "View",
	create: "Create",
	update: "Edit",
	delete: "Delete",
	role: "Change roles",
	cancel: "Revoke",
	accept: "Accept",
};

/** Full-screen, non-swipe-dismissable modal: native back and Done use the same confirmation. */
export function ApiKeyCreator({
	onClose,
	onCreated,
}: {
	onClose: () => void;
	onCreated: () => void;
}) {
	const api = useApi();
	const t = useTheme();
	const [ready, setReady] = useState(false);
	const [name, setName] = useState("");
	const [mode, setMode] = useState<KeyMode>("transactional");
	const [expiry, setExpiry] = useState<KeyExpiry>("never");
	const [permissions, setPermissions] = useState<Permissions>(
		defaultKeyPermissions,
	);
	const [busy, setBusy] = useState(false);
	const [copying, setCopying] = useState(false);
	const [error, setError] = useState("");
	const [hasSecret, setHasSecret] = useState(false);
	const [copied, setCopied] = useState(false);
	const [active, setActive] = useState(AppState.currentState === "active");
	const secret = useRef(new OneTimeKeySecret());
	const alive = useRef(false);
	const submitting = useRef(false);
	const request = useRef<AbortController | null>(null);
	// Keep callbacks fresh without restarting protection while a secret is shown.
	const callbacks = useRef({ onClose, onCreated });
	callbacks.current = { onClose, onCreated };

	useEffect(() => {
		alive.current = true;
		const lease = keyProtectionLease({
			prevent: async () => {
				if (Platform.OS !== "ios" && Platform.OS !== "android")
					throw new Error("Native protection required");
				await ScreenCapture.preventScreenCaptureAsync("api-key-secret");
			},
			allow: () => ScreenCapture.allowScreenCaptureAsync("api-key-secret"),
			enableSwitcher: () =>
				Platform.OS === "ios"
					? ScreenCapture.enableAppSwitcherProtectionAsync(1)
					: Promise.resolve(),
			disableSwitcher: () =>
				Platform.OS === "ios"
					? ScreenCapture.disableAppSwitcherProtectionAsync()
					: Promise.resolve(),
		});
		void lease.ready
			.then((protectedScreen) => {
				if (alive.current && protectedScreen) setReady(true);
			})
			.catch(() => {
				if (!alive.current) return;
				Alert.alert(
					"Screen protection unavailable",
					"Rebuild the native app with the screen-capture module before creating a key. No key was created.",
				);
				callbacks.current.onClose();
			});
		const subscription = AppState.addEventListener("change", (state) =>
			setActive(state === "active"),
		);
		return () => {
			alive.current = false;
			request.current?.abort();
			secret.current.clear();
			subscription.remove();
			void lease.dispose();
		};
	}, []);

	function close() {
		if (submitting.current || copying) return;
		const dismiss = () => {
			secret.current.clear();
			setHasSecret(false);
			callbacks.current.onClose();
		};
		if (!secret.current.needsCloseConfirmation()) {
			dismiss();
			return;
		}
		Alert.alert(
			"Close without copying?",
			"You won’t be able to see this secret again. If you lose it, revoke the key and create another.",
			[
				{ text: "Keep open", style: "cancel" },
				{
					text: "Close without copying",
					style: "destructive",
					onPress: dismiss,
				},
			],
		);
	}
	async function create() {
		if (!ready || submitting.current || secret.current.read()) return;
		setError("");
		let input: ReturnType<typeof createKeyInput>;
		try {
			input = createKeyInput(name, mode, expiry, permissions);
		} catch {
			setError(
				!name.trim() || name.trim().length > 64
					? "Give this key a name of 1–64 characters."
					: "Choose at least one supported permission and a valid expiry.",
			);
			return;
		}
		submitting.current = true;
		setBusy(true);
		const controller = new AbortController();
		request.current = controller;
		try {
			// Deliberately NOT a React Query mutation: the full response must never enter its cache/devtools.
			const result = await api.call("apiKey.create", input, {
				signal: controller.signal,
			});
			if (!alive.current) return;
			secret.current.show(result.key);
			setHasSecret(true);
			callbacks.current.onCreated();
		} catch {
			if (alive.current) {
				setError(
					"Couldn’t confirm creation. Refresh the key list before trying again — a key may have been created.",
				);
				callbacks.current.onCreated();
			}
		} finally {
			submitting.current = false;
			if (alive.current) setBusy(false);
		}
	}
	async function copy() {
		const value = secret.current.read();
		if (!value || copying || !active) return;
		setCopying(true);
		setError("");
		try {
			if (!(await Clipboard.setStringAsync(value)))
				throw new Error("Copy failed");
			if (!alive.current) return;
			secret.current.markCopied();
			setCopied(true);
		} catch {
			if (alive.current)
				setError("Couldn’t copy the key. Try again before closing.");
		} finally {
			if (alive.current) setCopying(false);
		}
	}
	// Mount the native modal only AFTER protection: RN Android copies FLAG_SECURE from the activity when opening its dialog.
	if (!ready) return null;
	return (
		<Modal
			visible
			presentationStyle="fullScreen"
			animationType="none"
			allowSwipeDismissal={false}
			onRequestClose={close}
		>
			<Screen
				edges={["top", "left", "right", "bottom"]}
				contentStyle={{ paddingTop: 24 }}
			>
				<Display size={32}>
					{hasSecret ? "Copy your API key" : "Create API key"}
				</Display>
				{hasSecret ? (
					<Card>
						<Body weight="semibold">Store this now</Body>
						<Body tone="muted">
							This is the only time the full key is shown. Store it somewhere
							safe. Revoke it if you lose it.
						</Body>
						{/* No selection menu or accessibility value while inactive; native protection also covers snapshots. */}
						<Body
							accessibilityLabel={
								active ? "New API key secret" : "API key hidden"
							}
							style={{
								fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
							}}
						>
							{active
								? secret.current.read()
								: "Hidden while the app is inactive"}
						</Body>
						<GlassButton
							prominent
							label={copied ? "Copied — copy again" : "Copy API key"}
							busy={copying}
							disabled={!active}
							onPress={() => void copy()}
						/>
						{copied ? (
							<FormMessage tone="positive">
								API key copied. Save it in your trusted password manager.
							</FormMessage>
						) : null}
					</Card>
				) : (
					<>
						<Body tone="muted">
							The secret is shown once. Choose only the access your integration
							needs.
						</Body>
						<Field
							label="Name"
							value={name}
							onChangeText={setName}
							placeholder="Claude, scripts, CI"
							maxLength={64}
							editable={!busy}
							autoCorrect={false}
						/>
						<Card>
							<Body weight="semibold">Access</Body>
							{modes.map((option) => (
								<Pressable
									key={option.value}
									accessibilityRole="radio"
									accessibilityState={{
										checked: mode === option.value,
										disabled: busy,
									}}
									disabled={busy}
									onPress={() => {
										setMode(option.value);
										if (
											!expiryChoices(option.value).some(
												(choice) => choice.value === expiry,
											)
										)
											setExpiry("30");
									}}
									style={{
										padding: 14,
										gap: 4,
										borderRadius: 14,
										borderWidth: 1,
										borderColor: mode === option.value ? t.ring : t.border,
									}}
								>
									<Body weight="semibold">
										{keyModeLabels[option.value]}
										{mode === option.value ? " · Selected" : ""}
									</Body>
									<Body tone="muted" size={14}>
										{option.description}
									</Body>
								</Pressable>
							))}
						</Card>
						{mode === "custom"
							? keyScopeResources.map((row) => (
									<Card key={row.resource}>
										<Body weight="semibold">{row.label}</Body>
										<Body tone="muted" size={14}>
											{row.description}
										</Body>
										{statement[row.resource].map((action) => (
											<View
												key={action}
												style={{
													flexDirection: "row",
													justifyContent: "space-between",
													alignItems: "center",
													gap: 12,
												}}
											>
												<Body style={{ flex: 1 }}>
													{actionLabels[action] ?? action}
												</Body>
												<Switch
													disabled={busy}
													accessibilityLabel={`${row.label}: ${actionLabels[action] ?? action}`}
													value={
														permissions[row.resource]?.includes(action) ?? false
													}
													onValueChange={(checked) =>
														setPermissions((current) => ({
															...current,
															[row.resource]: checked
																? [...(current[row.resource] ?? []), action]
																: (current[row.resource] ?? []).filter(
																		(value) => value !== action,
																	),
														}))
													}
												/>
											</View>
										))}
									</Card>
								))
							: null}
						<Card>
							<Body weight="semibold">Expires</Body>
							{expiryChoices(mode).map((option) => (
								<Pressable
									key={option.value}
									accessibilityRole="radio"
									accessibilityState={{
										checked: expiry === option.value,
										disabled: busy,
									}}
									disabled={busy}
									onPress={() => setExpiry(option.value)}
									style={{ minHeight: 48, justifyContent: "center" }}
								>
									<Body>
										{option.label}
										{expiry === option.value ? " · Selected" : ""}
									</Body>
								</Pressable>
							))}
						</Card>
						<GlassButton
							prominent
							label={busy ? "Creating…" : "Create key"}
							busy={busy}
							onPress={() => void create()}
						/>
					</>
				)}
				{error ? <FormMessage>{error}</FormMessage> : null}
				<GlassButton
					label={hasSecret ? "Done" : "Cancel"}
					disabled={busy || copying}
					onPress={close}
				/>
			</Screen>
		</Modal>
	);
}
