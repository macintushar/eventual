import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const generatedPath = fileURLToPath(
	new URL("../src/routeTree.gen.ts", import.meta.url),
);
const generated = spawnSync("bunx", ["tsr", "generate"], {
	cwd: root,
	stdio: "inherit",
});
if (generated.error) throw generated.error;
if (generated.status !== 0) process.exit(generated.status ?? 1);

// The standalone Router CLI omits the registration that Start's Vite plugin adds.
const footer = `
import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
`;
const tree = readFileSync(generatedPath, "utf8");
if (!tree.includes("declare module '@tanstack/react-start'")) {
	writeFileSync(generatedPath, `${tree.trimEnd()}\n${footer}`);
}
