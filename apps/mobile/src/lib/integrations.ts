/**
 * Where this server's integration and help pages live. Every Eventual server
 * serves the same web app, so these are fixed paths on its origin. Only the
 * status page and support address are operator-set, via `/v1/site`.
 */
export type IntegrationSite = {
	origin?: string;
	supportEmail?: string | null;
	statusPageUrl?: string | null;
};

const WEB_URL = /^https?:\/\/[^\s]+$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function integrationLinks(origin: string, site: IntegrationSite | null) {
	// The server's own public address, when it states one, is what other
	// devices and assistants can reach; the typed address is the fallback.
	const base = (site?.origin || origin).replace(/\/+$/, "");
	const status = site?.statusPageUrl?.trim();
	const support = site?.supportEmail?.trim();
	return {
		base,
		mcp: `${base}/mcp`,
		api: `${base}/api`,
		reference: `${base}/api/docs`,
		shortcut: `${base}/eventual.shortcut`,
		aiShortcut: `${base}/eventual-ai.shortcut`,
		help: `${base}/help`,
		docs: `${base}/docs`,
		privacy: `${base}/privacy`,
		terms: `${base}/terms`,
		status: status && WEB_URL.test(status) ? status : null,
		support: support && EMAIL.test(support) ? `mailto:${support}` : null,
	};
}
