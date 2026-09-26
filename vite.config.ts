import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

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
		resolve: { tsconfigPaths: true },
		server: {
			watch: {
				ignored: ["**/local.db", "**/local.db-*", "**/*.db-wal", "**/*.db-shm"],
			},
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
