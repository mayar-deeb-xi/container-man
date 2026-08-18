import { Exclude, Expose } from "class-transformer";

import type { PublicUser, UserRole } from "@repo/auth";

/**
 * Serialization allowlist for the identity the auth endpoints hand back — the
 * answer to "who am I", which is what login, refresh and `/auth/me` all return.
 *
 * This duplicates `PublicUser` on purpose. That interface lives in `@repo/auth`,
 * which the admin app imports at runtime — decorating it there would drag
 * class-transformer and reflect-metadata into the browser bundle. `implements
 * PublicUser` is what keeps the copy honest: widen the shared interface and this
 * file stops compiling until the new field is deliberately exposed or omitted.
 *
 * Only `@Expose`d fields reach the wire, and the service hands the interceptor a
 * whole `users` row — so this list is the only thing standing between
 * `passwordHash` and the response. Adding a column to the table is safe by
 * default; exposing it here is the deliberate act.
 */
@Exclude()
export class UserEntity implements PublicUser {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() name: string | null;
  @Expose() role: UserRole;
}
