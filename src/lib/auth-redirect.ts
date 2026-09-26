const redirectBase = "https://eventual.invalid";

/** Keep post-authentication navigation on this site, including odd URL spellings. */
export function safeAuthRedirect(value: string | undefined) {
	if (!value?.startsWith("/")) return "/app";
	try {
		const url = new URL(value, redirectBase);
		if (url.origin !== redirectBase) return "/app";
		const target = `${url.pathname}${url.search}${url.hash}`;
		return new URL(target, redirectBase).origin === redirectBase
			? target
			: "/app";
	} catch {
		return "/app";
	}
}
