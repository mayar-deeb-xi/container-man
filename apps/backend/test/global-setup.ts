import { existsSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { PERMISSION_CATALOG } from "@repo/access";
import * as schema from "@repo/db/schema";

import { TEST_DATABASE_URL } from "./harness";

/**
 * Runs once per test run: drops and recreates the dedicated test database on the local
 * Docker Postgres, applies every migration to it, and seeds the permission catalog —
 * so each run starts from exactly what a fresh deployment would have, and proves along
 * the way that the migrations (including 0005's data cleanup) apply cleanly.
 */
export default async function globalSetup(): Promise<void> {
  const testUrl = new URL(TEST_DATABASE_URL);
  const databaseName = testUrl.pathname.slice(1);

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";

  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists "${databaseName}" with (force)`);
    await admin.unsafe(`create database "${databaseName}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  try {
    // Vitest is invoked either from apps/backend (the package script) or the repo root.
    const migrationsFolder = [
      path.resolve(process.cwd(), "../../packages/db/migrations"),
      path.resolve(process.cwd(), "packages/db/migrations"),
    ].find((candidate) => existsSync(candidate));
    if (!migrationsFolder) throw new Error("could not locate packages/db/migrations");

    await migrate(db, { migrationsFolder });

    await db
      .insert(schema.permissions)
      .values(
        PERMISSION_CATALOG.map((entry) => ({
          action: entry.action,
          subject: entry.subject,
          description: entry.description,
        })),
      )
      .onConflictDoNothing();
  } finally {
    await client.end({ timeout: 5 });
  }
}
