import { Global, Module } from "@nestjs/common";

import type { Database } from "@repo/db";
import { db } from "@repo/db";

export const DRIZZLE = Symbol("DRIZZLE");

/**
 * `@repo/db` already memoizes its connection pool, so this module only exposes it
 * as an injectable token — which is what lets services take a `Database` in their
 * constructor and be swapped for a test double.
 */
@Global()
@Module({
  providers: [{ provide: DRIZZLE, useValue: db }],
  exports: [DRIZZLE],
})
export class DbModule {}

export type { Database };
