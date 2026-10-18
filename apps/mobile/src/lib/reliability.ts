import { isEventualApiError } from "@eventual/sdk";

export function isUnauthenticated(error: unknown) {
	return isEventualApiError(error) && error.status === 401;
}

export function networkAvailable(state: {
	isConnected?: boolean;
	isInternetReachable?: boolean;
}) {
	return state.isConnected !== false && state.isInternetReachable !== false;
}

export class OfflineWriteError extends Error {
	constructor() {
		super("You're offline. Connect and try again. Nothing was queued.");
	}
}

export function assertOnline(online: boolean) {
	if (!online) throw new OfflineWriteError();
}

export function returnedToForeground(previous: string | null, next: string) {
	return previous !== "active" && next === "active";
}

/** Only read destinations; never replay a composer or preserve form/search data. */
export function safeRecoveryPath(path: string): string | null {
	if (/^\/(?:activity|account(?:\/profile)?)$/.test(path) || path === "/")
		return path;
	if (/^\/invite\/[\w-]+$/.test(path)) return path;
	const group = path.match(/^\/group\/([\w-]+)(?:\/(.*))?$/);
	if (!group) return null;
	const base = `/group/${group[1]}`;
	const child = group[2];
	if (!child) return base;
	if (/^(?:expense|member)\/[\w-]+$/.test(child) && child !== "expense/compose")
		return path;
	return base;
}

export function recoveryDestination(
	destination: { path: string; origin: string; userId: string } | null,
	origin: string,
	userId: string,
) {
	return destination?.origin === origin && destination.userId === userId
		? safeRecoveryPath(destination.path)
		: null;
}

/** Epochs invalidate late session responses after expiry, sign-out or switching. */
export class SessionLifecycle<User extends { id: string }> {
	epoch = 0;
	user: User | null = null;
	expired = false;
	private controller = new AbortController();
	get signal() {
		return this.controller.signal;
	}
	private pending: Promise<void> | null = null;

	constructor(
		private publish: (
			user: User | null,
			stale: boolean,
			expired: boolean,
		) => void,
		private clear: () => void,
	) {}

	reset(expired = false) {
		this.controller.abort();
		this.controller = new AbortController();
		this.epoch++;
		this.pending = null;
		this.user = null;
		this.expired = expired;
		this.clear();
		this.publish(null, false, expired);
	}

	refresh(read: () => Promise<User | null>) {
		if (this.pending) return this.pending;
		const epoch = this.epoch;
		const task = (async () => {
			try {
				const user = await read();
				if (epoch !== this.epoch) return;
				if (!user) {
					this.reset(this.user !== null || this.expired);
					return;
				}
				if (this.user?.id !== user.id) {
					this.controller.abort();
					this.controller = new AbortController();
					this.epoch++;
					this.clear();
				}
				this.user = user;
				this.expired = false;
				this.publish(user, false, false);
			} catch (error) {
				if (epoch !== this.epoch) return;
				if (isUnauthenticated(error)) this.reset(true);
				else this.publish(this.user, true, this.expired);
			}
		})();
		this.pending = task;
		void task.finally(() => {
			if (this.pending === task) this.pending = null;
		});
		return task;
	}
}
