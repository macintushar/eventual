import { expoClient } from "@better-auth/expo/client";
import {
	createEventualClient,
	type EndpointOutput,
	type EventualClient,
} from "@eventual/sdk";
import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/client";
import * as SecureStore from "expo-secure-store";
import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { AppState } from "react-native";
import { refreshConnectivity, requireOnline } from "./connectivity";
import { createQueryClient } from "./query";
import { returnedToForeground, SessionLifecycle } from "./reliability";
import {
	HOSTED_ORIGIN,
	loadSavedServer,
	type ProbeFailure,
	probeServer,
	type Server,
	type SiteInfo,
	saveServer,
} from "./server";
import { guardSessionApi } from "./session-api";

function makeAuthClient(origin: string) {
	return createAuthClient({
		baseURL: `${origin}/api/auth`,
		plugins: [
			expoClient({
				scheme: "eventual",
				storagePrefix: "eventual",
				storage: SecureStore,
			}),
		],
	});
}
export type AuthClient = ReturnType<typeof makeAuthClient>;
export type SessionUser = NonNullable<EndpointOutput<"session.get">>["user"];

type Status = "loading" | "signed-out" | "signed-in" | "disconnected";

type SessionContext = {
	status: Status;
	sessionStale: boolean;
	sessionExpired: boolean;
	origin: string;
	/** Null until the server has answered once (or if it couldn't be reached). */
	site: SiteInfo | null;
	/** Why the last check of this server failed, if it did. */
	siteError: ProbeFailure | null;
	/** Last verified in-memory identity; null on a cold disconnected launch. */
	user: SessionUser | null;
	auth: AuthClient;
	api: EventualClient;
	reloadSite: () => Promise<void>;
	/** Switches server. Only offered while signed out: one account, one server. */
	chooseServer: (server: Server) => Promise<void>;
	/** Re-reads after sign-in/browser return; 401s immediately hide private data. */
	refreshSession: () => Promise<void>;
	signOut: () => Promise<void>;
};

const Context = createContext<SessionContext | null>(null);

export function useSession() {
	const value = useContext(Context);
	if (!value) throw new Error("useSession needs a SessionProvider");
	return value;
}

/** For screens behind the sign-in guard, where the session is known. */
export function useApi() {
	return useSession().api;
}

export function SessionProvider({ children }: PropsWithChildren) {
	const [origin, setOrigin] = useState<string | null>(null);
	const [site, setSite] = useState<SiteInfo | null>(null);
	const [siteError, setSiteError] = useState<ProbeFailure | null>(null);
	const [status, setStatus] = useState<Status>("loading");
	const [user, setUser] = useState<SessionUser | null>(null);
	const [sessionStale, setSessionStale] = useState(false);
	const [sessionExpired, setSessionExpired] = useState(false);
	const transitioning = useRef(false);
	const lifecycleRef = useRef<SessionLifecycle<SessionUser> | null>(null);
	const expire = useCallback(() => {
		// SDK transport and Query caches can both observe the same 401.
		if (lifecycleRef.current?.user) lifecycleRef.current.reset(true);
	}, []);
	const [queryClient] = useState(() => createQueryClient(expire));
	if (!lifecycleRef.current) {
		lifecycleRef.current = new SessionLifecycle(
			(nextUser, stale, expired) => {
				setUser(nextUser);
				setSessionStale(stale);
				setSessionExpired(expired);
				setStatus(
					nextUser
						? "signed-in"
						: stale && !expired
							? "disconnected"
							: "signed-out",
				);
			},
			() => {
				void queryClient.cancelQueries();
				queryClient.clear();
			},
		);
	}
	const lifecycle = lifecycleRef.current;
	const originRef = useRef(origin);
	originRef.current = origin;
	const auth = useMemo(
		() => (origin ? makeAuthClient(origin) : null),
		[origin],
	);

	const clients = useMemo(() => {
		if (!origin || !auth) return null;
		const rawApi = createEventualClient({
			baseUrl: origin,
			// The session cookie is ours to send; keep the OS cookie jar out of it.
			credentials: "omit",
			headers: async () => {
				const cookie = await auth.getCookie();
				return cookie ? { cookie } : undefined;
			},
		});
		// Guard every SDK call, including writes made outside useMutation. The
		// SDK makes one fetch and has no retry/queue. Discard late old-user results.
		const api = guardSessionApi(rawApi, {
			origin,
			userId: user?.id ?? null,
			snapshot: () => ({
				epoch: lifecycle.epoch,
				userId: lifecycle.user?.id ?? null,
				origin: originRef.current,
			}),
			requireOnline,
			expire,
			signal: () => lifecycle.signal,
		});
		return { auth, api };
	}, [origin, auth, lifecycle, expire, user?.id]);

	const refreshSession = useCallback(async () => {
		if (!clients || transitioning.current) return;
		await lifecycle.refresh(async () => {
			if (!(await clients.auth.getCookie())) return null;
			await refreshConnectivity();
			return (await clients.api.call("session.get"))?.user ?? null;
		});
	}, [clients, lifecycle]);

	useEffect(() => {
		let previous = AppState.currentState;
		const subscription = AppState.addEventListener("change", (next) => {
			if (returnedToForeground(previous, next)) void refreshSession();
			previous = next;
		});
		return () => subscription.remove();
	}, [refreshSession]);
	useEffect(
		() =>
			onlineManager.subscribe((online) => {
				if (online && AppState.currentState === "active") void refreshSession();
			}),
		[refreshSession],
	);

	const reloadSite = useCallback(async () => {
		if (!origin) return;
		setSiteError(null);
		try {
			const result = await probeServer(origin);
			if (origin !== originRef.current) return;
			if (result.ok) {
				setSite(result.server.site);
				await saveServer(result.server);
			} else setSiteError(result.reason);
		} catch {
			if (origin === originRef.current) setSiteError("unreachable");
		}
	}, [origin]);

	useEffect(() => {
		void loadSavedServer().then((saved) => {
			setOrigin(saved?.origin ?? HOSTED_ORIGIN);
			setSite(saved?.site ?? null);
		});
	}, []);

	useEffect(() => {
		if (!clients) return;
		void refreshSession();
		void reloadSite();
	}, [clients, refreshSession, reloadSite]);

	const chooseServer = useCallback(
		async (server: Server) => {
			if (status !== "signed-out" || transitioning.current)
				throw new Error("Sign out before switching servers.");
			transitioning.current = true;
			try {
				if (server.origin !== origin) {
					// Signed out already, but don't let a stale cookie cross servers.
					lifecycle.reset();
					await clients?.auth.signOut().catch(() => {});
					if (await clients?.auth.getCookie())
						throw new Error(
							"Couldn't clear the saved session. Try signing out again.",
						);
				}
				await saveServer(server);
				originRef.current = server.origin;
				setSite(server.site);
				setSiteError(null);
				setOrigin(server.origin);
			} finally {
				transitioning.current = false;
			}
		},
		[clients, origin, lifecycle, status],
	);

	const signOut = useCallback(async () => {
		if (transitioning.current) return;
		transitioning.current = true;
		// Hide/cancel before the network request, not after an offline timeout.
		lifecycle.reset();
		try {
			// Installed Expo auth plugin clears its local cookie/cache before fetch.
			await clients?.auth.signOut().catch(() => {});
		} finally {
			transitioning.current = false;
		}
	}, [clients, lifecycle]);

	if (!origin || !clients) return null;
	return (
		<Context.Provider
			value={{
				status,
				sessionStale,
				sessionExpired,
				origin,
				site,
				siteError,
				user,
				auth: clients.auth,
				api: clients.api,
				reloadSite,
				chooseServer,
				refreshSession,
				signOut,
			}}
		>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</Context.Provider>
	);
}
