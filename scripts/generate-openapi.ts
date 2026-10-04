import { readFile, writeFile } from "node:fs/promises";

// Importing the operation registry loads server modules; generation needs no
// running server, credentials, migrations or application database.
process.env.TURSO_DATABASE_URL = ":memory:";
process.env.TURSO_AUTH_TOKEN = "";
process.env.BETTER_AUTH_SECRET = "openapi-generation-only-secret-32-characters";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--check")) {
	throw new Error("Usage: tsx scripts/generate-openapi.ts [--check]");
}
const { openApiDocument } = await import("../src/server/openapi");
const file = new URL("../public/openapi.json", import.meta.url);
// Relative server URL makes the artifact identical in every environment.
const generated = `${JSON.stringify(openApiDocument(), null, 2)}\n`;

if (args.includes("--check")) {
	let current: string | undefined;
	try {
		current = await readFile(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	if (current !== generated) {
		console.error(
			"public/openapi.json is missing or stale. Run `bun run api:docs:generate` and commit the updated file.",
		);
		process.exitCode = 1;
	} else {
		console.log("public/openapi.json matches the current API contracts.");
	}
} else {
	await writeFile(file, generated);
	console.log("Generated public/openapi.json");
}
