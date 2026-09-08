import { config } from "dotenv";
import { migrate } from "drizzle-orm/libsql/migrator";

config({ path: [".env.local", ".env"] });
const { db } = await import("#/db");

await migrate(db, { migrationsFolder: "drizzle" });
console.log("Database migrations applied");
