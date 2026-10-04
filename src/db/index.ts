import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "#/env";
import { withDatabaseLogging } from "#/lib/database-logging";
import { instrumentDatabase } from "#/server/performance";
import * as schema from "./schema";

const client = withDatabaseLogging(
	createClient({
		url: env.TURSO_DATABASE_URL,
		authToken: env.TURSO_AUTH_TOKEN,
	}),
);

export const db = drizzle(instrumentDatabase(client), { schema });
export type Database = typeof db;
