import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import { PUBLIC_PAGES } from "./src/lib/public-pages";

/**
 * Paths the dev server must not treat as source.
 *
 * Neither chokidar nor Vite reads .gitignore, so every directory a tool writes
 * into the project has to be listed. Playwright rewrites its HTML report,
 * traces and storage state on every run; without this the browser full-reloads
 * whenever it touches one of those files, detaching elements part-way through an
 * assertion. The build output and the local SQLite database churn for the same
 * reason.
 *
 * Applied twice on purpose: Vite and Nitro each keep their own watcher, and
 * either one reacting is enough to reload the page.
 */
const devWatchIgnored = [
	"**/local.db",
	"**/local.db-*",
	"**/*.db-wal",
	"**/*.db-shm",
	"**/playwright-report",
	"**/playwright-report/**",
	"**/test-results",
	"**/test-results/**",
	"**/.output",
	"**/.output/**",
];

const config = defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const sentryBuildPlugins =
		env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT
			? sentryTanstackStart({
					org: env.SENTRY_ORG,
					project: env.SENTRY_PROJECT,
					authToken: env.SENTRY_AUTH_TOKEN,
					telemetry: false,
				})
			: [];
	return {
		logLevel: process.env.E2E ? "error" : "info",
		resolve: { tsconfigPaths: true },
		server: {
			watch: { ignored: devWatchIgnored },
		},
		optimizeDeps: {
			include: [
				"@better-auth/core/utils/string",
				"@better-fetch/fetch",
				"defu",
				"nanostores",
			],
		},
		plugins: [
			devtools(),
			nitro({
				watchOptions: { ignored: devWatchIgnored },
				// Public pages and the sitemap come from one list, so a page added
				// there is both prerendered and listed.
				routeRules: Object.fromEntries(
					[...PUBLIC_PAGES.map((page) => page.path), "/sitemap.xml"].map(
						(path) => [path, { prerender: true }],
					),
				),
			}),
			tailwindcss(),
			tanstackStart(),
			viteReact(),
			// Keep this last: it annotates TanStack middleware and uploads source maps.
			...sentryBuildPlugins,
		],
	};
});

export default config;
