import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "#/db";

await migrate(db, { migrationsFolder: "drizzle" });
console.log("Database migrations applied");
