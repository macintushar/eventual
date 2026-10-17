/**
 * The second of two simultaneous payments in settlements.test.ts. It runs on
 * its own thread with its own connection: the local libsql driver is
 * synchronous, so two connections on one thread can never overlap.
 */
import { parentPort, workerData } from "node:worker_threads";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "#/db/schema";
import type { Ctx } from "#/server/context";
import { createSettlement } from "./settlements";

const { url, ctx, input } = workerData as {
	url: string;
	ctx: Omit<Ctx, "db">;
	input: Parameters<typeof createSettlement>[1];
};
const client = createClient({ url });
await client.execute("PRAGMA busy_timeout = 5000");
const db = drizzle(client, { schema });

parentPort?.once("message", async () => {
	try {
		const result = await createSettlement({ ...ctx, db } as Ctx, input);
		parentPort?.postMessage({
			ok: true,
			allocations: result?.allocations.length,
		});
	} catch (error) {
		parentPort?.postMessage({ ok: false, error: String(error) });
	} finally {
		client.close();
	}
});
parentPort?.postMessage("ready");
