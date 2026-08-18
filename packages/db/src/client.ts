import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "./env";
import * as schema from "./schema";

/**
 * Next.js dev and Nest's watch mode both re-evaluate modules on reload; without
 * caching on globalThis every reload would open a fresh pool and exhaust
 * Postgres' connection limit.
 */
const globalForDb = globalThis as unknown as {
  __containerManSql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDb.__containerManSql ??
  postgres(env.DATABASE_URL, {
    max: 10,
    // drizzle handles its own type parsing; keep timestamps as Date objects.
    transform: undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__containerManSql = sql;
}

export const db = drizzle(sql, { schema });

export type Database = typeof db;
