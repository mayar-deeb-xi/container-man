import { Exclude, Expose } from "class-transformer";

import type { PublicUser, UserRole } from "@repo/auth";

/**
 * Serialization allowlist for the user payload.
 *
 * This duplicates `PublicUser` on purpose. That interface lives in `@repo/auth`,
 * which the admin app imports at runtime — decorating it there would drag
 * class-transformer and reflect-metadata into the browser bundle. `implements
 * PublicUser` is what keeps the copy honest: widen the shared interface and this
 * file stops compiling until the new field is deliberately exposed or omitted.
 *
 * Only `@Expose`d fields reach the wire, so this is a second line of defense
 * behind `UsersService.toPublic()` rather than a replacement for it.
 */
@Exclude()
export class UserEntity implements PublicUser {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() name: string | null;
  @Expose() role: UserRole;
}
