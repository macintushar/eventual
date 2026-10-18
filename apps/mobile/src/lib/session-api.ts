import { type EventualClient, getEndpoint } from "@eventual/sdk";
import { isUnauthenticated } from "./reliability";

/** SDK-only, no native imports: applies to direct calls as well as Query writes. */
export function guardSessionApi(
	api: EventualClient,
	options: {
		snapshot: () => {
			epoch: number;
			userId: string | null;
			origin: string | null;
		};
		origin: string;
		userId: string | null;
		requireOnline: () => Promise<void>;
		expire: () => void;
		signal?: () => AbortSignal;
	},
): EventualClient {
	return {
		call: new Proxy(api.call, {
			apply: async (call, _this, args) => {
				const before = options.snapshot();
				const endpoint = getEndpoint(args[0]);
				if (endpoint.method !== "GET") await options.requireOnline();
				const current = options.snapshot();
				if (
					options.origin !== current.origin ||
					before.epoch !== current.epoch ||
					(args[0] !== "session.get" &&
						(!options.userId || options.userId !== current.userId))
				)
					throw new Error("Session changed. Sign in and try again.");
				try {
					// Abort at the identity boundary even while the SDK awaits its cookie
					// header, so an old write cannot be dispatched with a new user's cookie.
					const controller = new AbortController();
					const signals = [options.signal?.(), args[2]?.signal].filter(
						Boolean,
					) as AbortSignal[];
					const abort = () => controller.abort();
					for (const signal of signals) {
						if (signal.aborted) abort();
						else signal.addEventListener("abort", abort, { once: true });
					}
					let result: unknown;
					try {
						result = await Reflect.apply(call, api, [
							args[0],
							args[1],
							{ ...args[2], signal: controller.signal },
						]);
					} finally {
						for (const signal of signals)
							signal.removeEventListener("abort", abort);
					}
					if (
						before.epoch !== options.snapshot().epoch ||
						options.origin !== options.snapshot().origin
					)
						throw new Error("Session changed. Try again.");
					return result;
				} catch (error) {
					// An old request's 401 must not revoke the newly signed-in account
					// via the global Query/MutationCache handler either.
					if (
						before.epoch !== options.snapshot().epoch ||
						options.origin !== options.snapshot().origin
					)
						throw new Error("Session changed. Try again.");
					if (
						before.epoch === options.snapshot().epoch &&
						options.origin === options.snapshot().origin &&
						isUnauthenticated(error)
					)
						options.expire();
					throw error;
				}
			},
		}),
	};
}
