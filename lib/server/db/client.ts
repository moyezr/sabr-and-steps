import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalDb = globalThis as unknown as { sabrPool?: Pool };

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!globalDb.sabrPool) {
    globalDb.sabrPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      statement_timeout: 5000,
    });
    // An idle connection can disappear when the local container stops.
    globalDb.sabrPool.on("error", () => undefined);
  }
  return globalDb.sabrPool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}
