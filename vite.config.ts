import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
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
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
