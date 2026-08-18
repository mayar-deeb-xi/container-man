import { Exclude, Expose } from "class-transformer";

import type { AppAction, AppSubject } from "@repo/access";

/**
 * Serialization allowlist for a catalog entry — one grantable (action, subject) pair.
 *
 * `createdAt` is deliberately absent: the catalog is a projection of
 * `PERMISSION_CATALOG` in `@repo/access`, so when a row was upserted says nothing
 * about the permission and only invites a client to display it as if it did.
 */
@Exclude()
export class PermissionEntity {
  @Expose() id: string;
  @Expose() action: AppAction;
  @Expose() subject: AppSubject;
  @Expose() description: string | null;
}
