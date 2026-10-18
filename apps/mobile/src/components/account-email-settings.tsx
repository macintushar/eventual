import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as AppleAuthentication from "expo-apple-authentication";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Platform,
	Switch,
	useColorScheme,
	View,
} from "react-native";
import { idempotencyKey } from "../lib/mutations";
import { useSession } from "../lib/session";
import { useTheme } from "../theme";
import {
	canDisconnect,
	cooldownSeconds,
	VERIFICATION_COOLDOWN_MS,
} from "./account-auth-policy";
import {
	Body,
	Card,
	Display,
	FormMessage,
	GlassButton,
	Heading,
	Screen,
} from "./brand";

const methodName = (provider: string) =>
	provider === "credential"
		? "Email and password"
		: provider === "google"
			? "Google"
			: provider === "apple"
				? "Apple"
				: provider;

function authError(error: { code?: string; message?: string }) {
	if (error.code === "SESSION_NOT_FRESH")
		return "Sign out and sign in again before disconnecting a sign-in method.";
	if (error.code === "FAILED_TO_UNLINK_LAST_ACCOUNT")
		return "Keep at least one sign-in method connected.";
	return error.message || "Couldn’t update your account. Try again.";
}

export default function AccountEmailSettings() {
	const t = useTheme();
	const colorScheme = useColorScheme();
	const [appleAvailable, setAppleAvailable] = useState(false);
	const { auth, api, origin, user, site, sessionStale, refreshSession } =
		useSession();
	const queryClient = useQueryClient();
	const [pending, setPending] = useState("");
	const working = useRef(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const cooldownKey = ["account-verification-cooldown", origin, user?.id];
	const [until, setUntil] = useState(
		() => queryClient.getQueryData<number>(cooldownKey) ?? 0,
	);
	const [now, setNow] = useState(Date.now);
	const remaining = cooldownSeconds(until, now);
	const key = ["account-sign-in-methods", origin, user?.id];
	const accounts = useQuery({
		queryKey: key,
		queryFn: async () => {
			const result = await auth.listAccounts();
			if (result.error) throw new Error(authError(result.error));
			if (!result.data) throw new Error("Couldn’t load sign-in methods.");
			return result.data;
		},
		retry: false,
	});
	const prefs = useQuery({
		queryKey: ["reminder-preferences"],
		queryFn: () => api.call("reminder.preferences.get", {}),
	});

	useFocusEffect(
		useCallback(() => {
			void refreshSession();
		}, [refreshSession]),
	);
	useEffect(() => {
		if (Platform.OS !== "ios") return;
		let active = true;
		void AppleAuthentication.isAvailableAsync()
			.then((available) => {
				if (active) setAppleAvailable(available);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);
	useEffect(() => {
		if (!until) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [until]);

	async function run(name: string, action: () => Promise<void>) {
		if (working.current || (sessionStale && name !== "refresh")) return;
		working.current = true;
		setPending(name);
		setError("");
		setMessage("");
		try {
			await action();
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Couldn’t update your account.",
			);
		} finally {
			working.current = false;
			setPending("");
		}
	}

	const preference = useMutation({
		mutationFn: (emailReminders: boolean) =>
			api.call(
				"reminder.preferences.update",
				{ emailReminders },
				{ idempotencyKey: idempotencyKey() },
			),
		onMutate: () => {
			setError("");
			setMessage("");
		},
		onSuccess: async (result) => {
			queryClient.setQueryData(["reminder-preferences"], result);
			await refreshSession();
			setMessage("Email reminder preference saved.");
		},
		onError: (cause) => setError(cause.message),
	});
	const disabled = Boolean(pending) || preference.isPending || sessionStale;

	function startCooldown() {
		const next = Date.now() + VERIFICATION_COOLDOWN_MS;
		queryClient.setQueryData(cooldownKey, next);
		setUntil(next);
		setNow(Date.now());
	}

	async function resend() {
		if (!user || user.emailVerified || cooldownSeconds(until, Date.now()))
			return;
		await run("verification", async () => {
			const result = await auth.sendVerificationEmail({
				email: user.email,
				// Verification stays on the server's existing web landing page.
				callbackURL: `${origin}/verify-email`,
			});
			if (result.error) {
				if (result.error.status === 429) {
					startCooldown();
				}
				throw new Error(authError(result.error));
			}
			startCooldown();
			setMessage(
				"Check your inbox and spam folder for a verification link. Links expire after one hour. If it doesn’t arrive, try again later; email delivery may not be configured on this server.",
			);
		});
	}

	async function connectGoogle() {
		if (!site?.googleSignIn) return;
		await run("google", async () => {
			// Expo's auth plugin handles /link-social browser handoff and keeps
			// the current session cookie. Never use signIn.social for linking.
			const result = await auth.linkSocial({
				provider: "google",
				callbackURL: "/account/email",
			});
			if (result.error) throw new Error(authError(result.error));
			const refreshed = await accounts.refetch();
			if (refreshed.error) throw refreshed.error;
			setMessage(
				refreshed.data?.some((account) => account.providerId === "google")
					? "Google connected."
					: "Google wasn’t connected. You can try again.",
			);
			await refreshSession();
		});
	}

	async function connectApple() {
		if (!site?.appleSignIn || !appleAvailable || disabled) return;
		await run("apple", async () => {
			let token: string | null;
			try {
				const credential = await AppleAuthentication.signInAsync({
					requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
				});
				token = credential.identityToken;
			} catch (cause) {
				if ((cause as { code?: string }).code === "ERR_REQUEST_CANCELED")
					return;
				throw cause;
			}
			if (!token)
				throw new Error("Apple didn’t return an identity token. Try again.");
			const result = await auth.linkSocial({
				provider: "apple",
				idToken: { token },
			});
			if (result.error) throw new Error(authError(result.error));
			const refreshed = await accounts.refetch();
			if (refreshed.error) throw refreshed.error;
			setMessage(
				refreshed.data?.some((account) => account.providerId === "apple")
					? "Apple connected."
					: "Apple wasn’t connected. You can try again.",
			);
			await refreshSession();
		});
	}

	function disconnect(id: string, provider: string) {
		if (
			disabled ||
			!canDisconnect(
				accounts.data ?? [],
				id,
				site,
				user?.emailVerified === true,
			)
		)
			return;
		Alert.alert(
			`Disconnect ${methodName(provider)}?`,
			"You won’t be able to sign in with this method until you connect it again.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Disconnect",
					style: "destructive",
					onPress: () =>
						void run(id, async () => {
							// Re-read before the destructive write, including after a long
							// confirmation. The server remains authoritative for concurrent edits.
							const latest = await auth.listAccounts();
							if (latest.error) throw new Error(authError(latest.error));
							if (
								!latest.data?.some((account) => account.id === id) ||
								!canDisconnect(
									latest.data,
									id,
									site,
									user?.emailVerified === true,
								)
							)
								throw new Error(
									"Keep another usable sign-in method connected. Refresh and try again.",
								);
							const result = await auth.unlinkAccount({ accountId: id });
							if (result.error) throw new Error(authError(result.error));
							await queryClient.invalidateQueries({ queryKey: key });
							setMessage(`${methodName(provider)} disconnected.`);
						}),
				},
			],
		);
	}

	return (
		<Screen edges={["left", "right"]} tabBar>
			<Display size={34}>Email and sign-in</Display>
			{sessionStale ? (
				<FormMessage>
					Your session couldn’t be refreshed. Reconnect and refresh before
					changing settings.
				</FormMessage>
			) : null}
			{error ? <FormMessage>{error}</FormMessage> : null}
			{message ? <FormMessage tone="positive">{message}</FormMessage> : null}
			<Card style={{ gap: 12 }}>
				<Heading>Email</Heading>
				<Body selectable>{user?.email}</Body>
				<Body tone="muted">
					{user?.emailVerified ? "Verified" : "Not verified"}
				</Body>
				{!user?.emailVerified ? (
					<>
						<Body tone="muted">
							Confirm this address belongs to you. Open the link in your email,
							then return here.
						</Body>
						<GlassButton
							label={
								remaining
									? `Resend in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
									: "Resend verification email"
							}
							busy={pending === "verification"}
							disabled={disabled || remaining > 0 || !user}
							onPress={() => void resend()}
						/>
					</>
				) : null}
				<GlassButton
					label="Refresh verification status"
					disabled={Boolean(pending) || preference.isPending}
					busy={pending === "refresh"}
					onPress={() => void run("refresh", refreshSession)}
				/>
				<Body tone="muted" size={14}>
					Changing your email address isn’t supported on this server.
				</Body>
			</Card>
			<Card style={{ gap: 14 }}>
				<Heading>Sign-in methods</Heading>
				{accounts.isPending ? (
					<ActivityIndicator color={t.ink} />
				) : accounts.isError ? (
					<>
						<FormMessage>Couldn’t load sign-in methods.</FormMessage>
						<GlassButton
							label="Try again"
							onPress={() => void accounts.refetch()}
						/>
					</>
				) : (
					<>
						{accounts.data.map((account) => {
							const removable =
								account.providerId === "google" ||
								account.providerId === "apple";
							const safe = canDisconnect(
								accounts.data,
								account.id,
								site,
								user?.emailVerified === true,
							);
							return (
								<View key={account.id} style={{ gap: 8 }}>
									<Body weight="semibold">
										{methodName(account.providerId)}
									</Body>
									<Body tone="muted" size={14}>
										Connected
										{(account.providerId === "google" && !site?.googleSignIn) ||
										(account.providerId === "apple" && !site?.appleSignIn)
											? " · not currently enabled on this server"
											: ""}
									</Body>
									{removable ? (
										<>
											{!safe ? (
												<Body tone="muted" size={14}>
													Keep another configured sign-in method connected, or
													verify your email/password method, before
													disconnecting.
												</Body>
											) : null}
											<GlassButton
												destructive
												label={`Disconnect ${methodName(account.providerId)}`}
												disabled={disabled || !safe || accounts.isFetching}
												busy={pending === account.id}
												onPress={() =>
													disconnect(account.id, account.providerId)
												}
											/>
										</>
									) : null}
								</View>
							);
						})}
						{!accounts.data.length ? (
							<Body tone="muted">
								No linked sign-in methods were returned by the server.
							</Body>
						) : null}
						{!accounts.data.some(
							(account) => account.providerId === "google",
						) ? (
							site?.googleSignIn ? (
								<>
									<Body tone="muted">
										Connect Google using the same email address as this account.
									</Body>
									<GlassButton
										label="Connect Google"
										busy={pending === "google"}
										disabled={disabled || accounts.isFetching}
										onPress={() => void connectGoogle()}
									/>
								</>
							) : (
								<Body tone="muted">
									Google sign-in isn’t configured on this server.
								</Body>
							)
						) : null}
						{site?.appleSignIn ? (
							<Body tone="muted" size={14}>
								Apple requires the same email as this account. Hide My Email may
								use a different address, which this server rejects.
							</Body>
						) : null}
						{!accounts.data.some((account) => account.providerId === "apple") &&
						site?.appleSignIn ? (
							appleAvailable ? (
								<View
									pointerEvents={
										disabled || accounts.isFetching ? "none" : "auto"
									}
									style={{ opacity: disabled ? 0.5 : 1 }}
									accessibilityElementsHidden={disabled}
									importantForAccessibility={
										disabled ? "no-hide-descendants" : "auto"
									}
								>
									<AppleAuthentication.AppleAuthenticationButton
										buttonType={
											AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
										}
										buttonStyle={
											colorScheme === "dark"
												? AppleAuthentication.AppleAuthenticationButtonStyle
														.WHITE
												: AppleAuthentication.AppleAuthenticationButtonStyle
														.BLACK
										}
										cornerRadius={26}
										style={{ height: 52, width: "100%" }}
										onPress={() => void connectApple()}
									/>
									{pending === "apple" ? (
										<ActivityIndicator color={t.ink} />
									) : null}
								</View>
							) : (
								<Body tone="muted" size={14}>
									Connecting Apple is only available on supported iOS devices.
									Existing Apple connections are shown above.
								</Body>
							)
						) : null}
					</>
				)}
			</Card>
			<Card style={{ gap: 12 }}>
				<Heading>Email reminders</Heading>
				<Body tone="muted">
					Let group members send scheduled reminders about what you owe. This is
					the same preference as in your profile, not push notifications.
				</Body>
				{prefs.isPending ? (
					<ActivityIndicator color={t.ink} />
				) : prefs.isError ? (
					<>
						<FormMessage>Couldn’t load your reminder preference.</FormMessage>
						<GlassButton
							label="Retry reminder preference"
							onPress={() => void prefs.refetch()}
						/>
					</>
				) : (
					<Switch
						accessibilityLabel="Email reminders"
						value={prefs.data.emailReminders}
						disabled={disabled || prefs.isFetching}
						onValueChange={(value) => preference.mutate(value)}
						trackColor={{ true: t.action }}
					/>
				)}
			</Card>
		</Screen>
	);
}
