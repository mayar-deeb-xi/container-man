import type { OnModuleDestroy } from "@nestjs/common";
import { Global, Module } from "@nestjs/common";

import type { Database } from "@repo/db";
import { closeDb, db } from "@repo/db";

export const DRIZZLE = Symbol("DRIZZLE");

/**
 * `@repo/db` already memoizes its connection pool, so this module only exposes it
 * as an injectable token — which is what lets services take a `Database` in their
 * constructor and be swapped for a test double.
 *
 * Owning the token also makes this the right place to drain the pool on shutdown;
 * the hook only runs because main.ts enables shutdown hooks.
 */
@Global()
@Module({
  providers: [{ provide: DRIZZLE, useValue: db }],
  exports: [DRIZZLE],
})
export class DbModule implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await closeDb();
  }
}

export type { Database };
