import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";
import "./api-reference.css";
import { useTheme } from "next-themes";
import { useLayoutEffect } from "react";

import { PublicHeader, publicSiteActions } from "#/components/public-header";
import { useClientUser } from "#/lib/session";

/**
 * Scalar rewrites the URL hash as you scroll (and on sidebar clicks) through
 * `history.replaceState`/`pushState`. TanStack Router patches both to catch
 * navigations, so every section scrolled past re-ran the route and flashed the
 * page. While the reference is mounted, hash-only updates on this page go
 * through the unpatched `History.prototype` methods, so the router never sees
 * them. The router's own history state is kept, since Scalar passes `{}`.
 * Anything else, like the masthead links, still goes through the router.
 */
function useHashOnlyHistory() {
	useLayoutEffect(() => {
		const { history } = window;
		const routerPush = history.pushState;
		const routerReplace = history.replaceState;
		const hashOnly = (url: string | URL | null | undefined) => {
			if (url == null) return false;
			const next = new URL(url, window.location.href);
			return (
				next.origin === window.location.origin &&
				next.pathname === window.location.pathname &&
				next.search === window.location.search
			);
		};
		history.pushState = function (data, unused, url) {
			return hashOnly(url)
				? History.prototype.pushState.call(this, this.state, unused, url)
				: routerPush.call(this, data, unused, url);
		};
		history.replaceState = function (data, unused, url) {
			return hashOnly(url)
				? History.prototype.replaceState.call(this, this.state, unused, url)
				: routerReplace.call(this, data, unused, url);
		};
		return () => {
			history.pushState = routerPush;
			history.replaceState = routerReplace;
		};
	}, []);
}

/**
 * The OpenAPI reference at /api/docs. Scalar renders the document; the brand
 * masthead sits above it and api-reference.css maps Scalar's theme variables
 * onto the paper-desk tokens, so the reference follows the app's light and
 * dark themes instead of Scalar's own.
 */
export default function ApiReference() {
	const { resolvedTheme } = useTheme();
	const user = useClientUser();
	useHashOnlyHistory();

	return (
		<div className="api-docs">
			<div className="api-docs-masthead">
				<PublicHeader
					wordmarkTo={user ? "/app" : "/"}
					actions={publicSiteActions(Boolean(user))}
				/>
			</div>
			<ApiReferenceReact
				configuration={{
					url: "/api/openapi.json",
					theme: "none",
					withDefaultFonts: false,
					// The masthead's theme toggle drives both the app and the reference.
					forceDarkModeState: resolvedTheme === "dark" ? "dark" : "light",
					hideDarkModeToggle: true,
					favicon: "/logo.svg",
					metaData: { title: "API Reference · Eventual" },
					// Scalar's hosted extras: none of them apply to Eventual's API.
					showDeveloperTools: "never",
					agent: { disabled: true },
					mcp: { disabled: true },
					telemetry: false,
					// Each operation keeps its own Test Request button, which opens the
					// client with that request ready; the sidebar shortcut is redundant.
					hideClientButton: true,
					hideModels: true,
					documentDownloadType: "json",
					defaultOpenFirstTag: true,
					defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
					// One idiomatic client per language people script Eventual from.
					hiddenClients: {
						c: true,
						clojure: true,
						csharp: true,
						dart: true,
						fsharp: true,
						http: true,
						java: true,
						julia: true,
						kotlin: true,
						objc: true,
						ocaml: true,
						php: true,
						powershell: true,
						r: true,
						ruby: true,
						rust: true,
						js: ["axios", "jquery", "ofetch", "xhr"],
						node: ["axios", "ofetch", "undici"],
						python: ["python3", "aiohttp", "httpx_sync", "httpx_async"],
						shell: ["httpie", "wget"],
					},
					authentication: { preferredSecurityScheme: "apiKey" },
				}}
			/>
		</div>
	);
}
