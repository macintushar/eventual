import { type EventualClient, isEventualApiError } from "@eventual/sdk";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	consumeOpportunity,
	getOpportunity,
	subscribeOpportunity,
} from "../lib/push/events";
import { pushCapability, shouldOfferExplainer } from "../lib/push/permissions";
import {
	ensureNotificationsModule,
	ensurePushRegistration,
	installNotificationHandler,
	notificationsSupported,
	type OsPermission,
	readNotificationPermission,
	requestNotificationPermission,
} from "../lib/push/registration";
import {
	consumePendingTap,
	destinationAfterAccess,
	type PushDestination,
	stagePendingTap,
} from "../lib/push/routing";
import { HOSTED_ORIGIN } from "../lib/server";
import { useSession } from "../lib/session";
import { useTheme } from "../theme";
import { Body, Card, GlassButton, Heading } from "./brand";

const OFFER_ANSWERED_KEY = "eventual_push_offer_answered";

type RouteTo = PushDestination | { kind: "home" };

/** Navigation-time access policy, shared by warm and deferred taps. */
async function checkAccess(
	run: () => Promise<unknown>,
): Promise<"granted" | "missing" | "error"> {
	try {
		await run();
		return "granted";
	} catch (error) {
		return isEventualApiError(error) && error.status === 404
			? "missing"
			: "error";
	}
}

/**
 * Authorized prefetches decide the final landing zone: a deleted expense
 * goes to the group activity, and a group the session can't reach falls all
 * the way back to the dashboard (docs 05 §B). Payload data itself is only a
 * suggestion of a place to look.
 */
async function resolveRoute(
	api: EventualClient,
	destination: PushDestination,
): Promise<RouteTo> {
	const groupAccess = await checkAccess(() =>
		api.call("app.groupContext", { groupId: destination.groupId }),
	);
	const expenseAccess =
		destination.kind === "expense"
			? await checkAccess(() =>
					api.call("expense.get", { expenseId: destination.expenseId }),
				)
			: ("granted" as const);
	return destinationAfterAccess(destination, {
		group: groupAccess,
		expense: expenseAccess,
	});
}

function hrefFor(route: RouteTo): string {
	if (route.kind === "expense")
		return `/group/${route.groupId}/expense/${route.expenseId}`;
	if (route.kind === "group") return `/group/${route.groupId}`;
	return "/";
}

function markOfferAnswered() {
	void SecureStore.setItemAsync(OFFER_ANSWERED_KEY, "1").catch(() => {});
}

/**
 * One component, mounted once from the root layout:
 * 1. registration of native APNs/FCM tokens for signed-in sessions,
 * 2. safe tap routing, including taps that arrive while signed out,
 * 3. the one-shot D2 explainer after a first expense save / invite accept.
 * A binary without the native module keeps everything inert.
 */
export function PushLifecycle() {
	const t = useTheme();
	const insets = useSafeAreaInsets();
	const { status, site, origin, user, api } = useSession();
	const [moduleSupported, setModuleSupported] = useState<boolean | null>(null);
	const [osPermission, setOsPermission] = useState<OsPermission>("unknown");
	const [answeredOnce, setAnsweredOnce] = useState<boolean | null>(null);
	const opportunity = useSyncExternalStore(
		subscribeOpportunity,
		getOpportunity,
		getOpportunity,
	);

	/** Raw notification data waiting for the next settled session. */
	const pendingTap = useRef<unknown>(null);
	/** Bump to re-evaluate a staged/arrived tap. */
	const [routePulse, setRoutePulse] = useState(0);
	/** Fresh session state for listeners that can't rebuild on every render. */
	const session = useRef({ status, site, origin, user, api });
	session.current = { status, site, origin, user, api };

	const capability = pushCapability(HOSTED_ORIGIN, origin, site);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			await installNotificationHandler();
			const supported = await notificationsSupported();
			const permission = supported
				? await readNotificationPermission()
				: "unknown";
			let answered: boolean;
			try {
				answered = (await SecureStore.getItemAsync(OFFER_ANSWERED_KEY)) === "1";
			} catch {
				answered = false;
			}
			if (cancelled) return;
			setModuleSupported(supported);
			setOsPermission(permission);
			setAnsweredOnce(answered);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	/** Cold-start and warm taps land in the same staging slot. */
	useEffect(() => {
		let cancelled = false;
		let subscription: { remove(): void } | null = null;
		void (async () => {
			const mod = await ensureNotificationsModule();
			if (!mod || cancelled) return;
			try {
				// Sync, non-deprecated; the deprecated async twin catches older
				// builds that don't ship the sync getter.
				let data: unknown;
				if (mod.getLastNotificationResponse) {
					data =
						mod.getLastNotificationResponse()?.notification?.request?.content
							?.data;
				} else {
					data = (await mod.getLastNotificationResponseAsync())?.notification
						?.request?.content?.data;
				}
				if (data) {
					pendingTap.current = data;
					setRoutePulse((pulse) => pulse + 1);
				}
			} catch {
				// No stored response (cold starts without a tap happen too).
			}
			if (cancelled) return;
			subscription =
				mod.addNotificationResponseReceivedListener?.((response) => {
					const data = response?.notification?.request?.content?.data;
					if (!data) return;
					pendingTap.current = data;
					setRoutePulse((pulse) => pulse + 1);
				}) ?? null;
		})();
		return () => {
			cancelled = true;
			subscription?.remove();
		};
	}, []);

	/** Registration for the signed-in account and server only. */
	useEffect(() => {
		// Re-runs after a permission grant (the OS settings return lands here);
		// denial or a missing native module makes the attempt moot.
		if (moduleSupported === false || osPermission === "denied") return;
		if (status !== "signed-in" || !user || !api) return;
		void ensurePushRegistration(api, {
			origin,
			userId: user.id,
			hostedOrigin: HOSTED_ORIGIN,
			site,
		});
	}, [status, user, origin, site, api, osPermission, moduleSupported]);

	/** Token rotation (os resets, reinstall fingerprint changes, etc.). */
	useEffect(() => {
		if (status !== "signed-in" || !user || !api) return;
		let cancelled = false;
		let subscription: { remove(): void } | null = null;
		void (async () => {
			const mod = await ensureNotificationsModule();
			if (!mod?.addPushTokenListener || cancelled) return;
			subscription =
				mod.addPushTokenListener(() => {
					const current = session.current;
					if (current.status !== "signed-in" || !current.user) return;
					void ensurePushRegistration(current.api, {
						origin: current.origin,
						userId: current.user.id,
						hostedOrigin: HOSTED_ORIGIN,
						site: current.site,
					});
				}) ?? null;
		})();
		return () => {
			cancelled = true;
			subscription?.remove();
		};
	}, [status, user, api]);

	/** Signed-out: hold nothing across identities. */
	useEffect(() => {
		if (status === "signed-out") pendingTap.current = null;
	}, [status]);

	/**
	 * Consume a staged tap once a real session exists. Landing requires the
	 * tap-time origin and the current user to still match — switching servers
	 * or accounts while holding a tap drops it instead of cross-linking.
	 */
	useEffect(() => {
		if (status !== "signed-in" || !user || !origin || !api) return;
		// `routePulse < 0` is never true: the counter exists only to re-run this
		// effect when a tap lands in the staging slot below.
		if (routePulse < 0) return;
		const staged = pendingTap.current;
		if (staged === null) return;
		pendingTap.current = null;
		const held = stagePendingTap(staged, { origin });
		if (!held) return;
		const destination = consumePendingTap(held, {
			origin,
			userId: user.id,
		});
		if (!destination) return;
		void (async () => {
			try {
				const route = await resolveRoute(api, destination);
				// Session may have flipped during the access checks.
				if (
					session.current.status !== "signed-in" ||
					session.current.user?.id !== user.id ||
					session.current.origin !== origin
				)
					return;
				router.push(hrefFor(route));
			} catch {
				// Out of reach for now; the payload never contained enough to
				// risk navigating blind.
			}
		})();
	}, [status, user, origin, api, routePulse]);
	const gateOpen =
		shouldOfferExplainer({
			opportunity,
			alreadyOffered: answeredOnce === true,
			signInStatus: status,
			capability,
			osPermission,
		}) === "offer" && moduleSupported === true;

	const answerGate = useCallback(
		async (turnOn: boolean) => {
			consumeOpportunity();
			setAnsweredOnce(true);
			markOfferAnswered();
			if (!turnOn) return;
			// The one place the OS prompt appears from the explainer flow.
			const permission = await requestNotificationPermission();
			setOsPermission(permission);
			if (permission === "granted" && user && api)
				void ensurePushRegistration(api, {
					origin,
					userId: user.id,
					hostedOrigin: HOSTED_ORIGIN,
					site,
				});
		},
		[api, origin, site, user],
	);

	return (
		<Modal
			animationType="slide"
			transparent
			visible={gateOpen}
			onRequestClose={() => void answerGate(false)}
		>
			<Pressable
				style={{
					flex: 1,
					justifyContent: "flex-end",
					backgroundColor: "rgba(0,0,0,0.3)",
				}}
				onPress={() => void answerGate(false)}
			>
				<Pressable
					accessibilityLabel="Turn on notifications?"
					style={{ paddingHorizontal: 16 }}
					onPress={() => {}}
				>
					<Card
						elevated
						style={{
							gap: 10,
							padding: 20,
							paddingBottom: 24 + (insets.bottom ?? 0),
							borderRadius: 28,
							borderWidth: 0,
							backgroundColor: t.paper,
						}}
					>
						<Heading>Turn on notifications?</Heading>
						<Body tone="muted" size={15}>
							Get a nudge when someone in your groups adds, updates or deletes
							an expense, or records a payment. You never get notified about
							your own actions, and groups can be muted from their settings.
						</Body>
						<View style={{ gap: 10, marginTop: 4 }}>
							<GlassButton
								prominent
								label="Turn on notifications"
								onPress={() => void answerGate(true)}
							/>
							<GlassButton
								label="Not now"
								onPress={() => void answerGate(false)}
							/>
						</View>
					</Card>
				</Pressable>
			</Pressable>
		</Modal>
	);
}
