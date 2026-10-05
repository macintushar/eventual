import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

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
				routeRules: {
					"/": { prerender: true },
					"/docs": { prerender: true },
					"/help": { prerender: true },
					"/help/create-a-group": { prerender: true },
					"/help/add-an-expense": { prerender: true },
					"/privacy": { prerender: true },
					"/terms": { prerender: true },
				},
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
