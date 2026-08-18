import { Exclude, Expose } from "class-transformer";

import type { UserRole } from "@repo/auth";

/**
 * Serialization allowlist for the identity the auth endpoints hand back — the
 * answer to "who am I", which is what login, refresh and `/auth/me` all return.
 *
 * Every field is written out rather than declared against a shared interface.
 * This class is the contract: the admin app hand-mirrors it in
 * `apps/admin-app/src/services/auth/types.ts` rather than importing a type from
 * a workspace package, so the two sides stay coupled by the wire format alone —
 * which is all an HTTP boundary can actually guarantee.
 *
 * Only `@Expose`d fields reach the wire, and the service hands the interceptor a
 * whole `users` row — so this list is the only thing standing between
 * `passwordHash` and the response. Adding a column to the table is safe by
 * default; exposing it here is the deliberate act.
 */
@Exclude()
export class UserEntity {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() name: string | null;
  @Expose() role: UserRole;
}
