import { expoClient } from "@better-auth/expo/client";
import {
	createEventualClient,
	type EndpointOutput,
	type EventualClient,
} from "@eventual/sdk";
import { QueryClientProvider } from "@tanstack/react-query";
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
import { createQueryClient } from "./query";
import {
	HOSTED_ORIGIN,
	loadSavedServer,
	type ProbeFailure,
	probeServer,
	type Server,
	type SiteInfo,
	saveServer,
} from "./server";

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

type Status = "loading" | "signed-out" | "signed-in";

type SessionContext = {
	status: Status;
	origin: string;
	/** Null until the server has answered once (or if it couldn't be reached). */
	site: SiteInfo | null;
	/** Why the last check of this server failed, if it did. */
	siteError: ProbeFailure | null;
	/** Null if the session couldn't be read (offline) but a cookie is stored. */
	user: SessionUser | null;
	auth: AuthClient;
	api: EventualClient;
	reloadSite: () => Promise<void>;
	/** Switches server. Only offered while signed out: one account, one server. */
	chooseServer: (server: Server) => Promise<void>;
	/** Re-reads the session after signing in, or after a 401. */
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

	const clients = useMemo(() => {
		if (!origin) return null;
		const auth = makeAuthClient(origin);
		const api = createEventualClient({
			baseUrl: origin,
			// The session cookie is ours to send; keep the OS cookie jar out of it.
			credentials: "omit",
			headers: async () => {
				const cookie = await auth.getCookie();
				return cookie ? { cookie } : undefined;
			},
		});
		return { auth, api };
	}, [origin]);

	const refreshRef = useRef<() => Promise<void>>(async () => {});
	const [queryClient] = useState(() =>
		createQueryClient(() => void refreshRef.current()),
	);

	const refreshSession = useCallback(async () => {
		if (!clients) return;
		if (!(await clients.auth.getCookie())) {
			setUser(null);
			setStatus("signed-out");
			return;
		}
		try {
			const session = await clients.api.call("session.get");
			if (session) {
				setUser(session.user);
				setStatus("signed-in");
			} else {
				// The server no longer knows this cookie: expired or revoked.
				await clients.auth.signOut().catch(() => {});
				queryClient.clear();
				setUser(null);
				setStatus("signed-out");
			}
		} catch {
			// Offline or the server is down. Keep the stored session; screens show
			// their own error states, and the next 401 signs out.
			setStatus("signed-in");
		}
	}, [clients, queryClient]);
	refreshRef.current = refreshSession;

	const reloadSite = useCallback(async () => {
		if (!origin) return;
		setSiteError(null);
		try {
			const result = await probeServer(origin);
			if (result.ok) {
				setSite(result.server.site);
				await saveServer(result.server);
			} else setSiteError(result.reason);
		} catch {
			setSiteError("unreachable");
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
			if (server.origin !== origin) {
				// Signed out already, but don't let a stale cookie cross servers.
				await clients?.auth.signOut().catch(() => {});
				queryClient.clear();
			}
			await saveServer(server);
			setSite(server.site);
			setSiteError(null);
			setOrigin(server.origin);
		},
		[clients, origin, queryClient],
	);

	const signOut = useCallback(async () => {
		await clients?.auth.signOut().catch(() => {});
		queryClient.clear();
		setUser(null);
		setStatus("signed-out");
	}, [clients, queryClient]);

	if (!origin || !clients) return null;
	return (
		<Context.Provider
			value={{
				status,
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
