import { SetMetadata } from "@nestjs/common";

import type { AppAction, AppSubject } from "@repo/access";

export const ABILITY_KEY = "required-ability";

/** One thing the caller must be permitted to do. */
export interface RequiredAbility {
  action: AppAction;
  subject: AppSubject;
}

/**
 * Declares what a route requires — `@RequireAbility({ action: "read", subject: "User" })`.
 *
 * Several are ANDed: a route that reads users *and* their roles should say so, and
 * be refused unless both are granted. Inert on its own; `AbilityGuard` reads this.
 *
 * Note what this cannot express: conditions. A rule may grant `update User` only
 * where `id` matches the caller, and a route-level check has no instance to test
 * that against — it can only confirm the caller may update *some* user. Where that
 * distinction matters the handler re-checks against the row it loaded, with
 * `subject()` from `@repo/access`. The guard is the coarse gate; the service is
 * where ownership is decided.
 */
export const RequireAbility = (...abilities: RequiredAbility[]) =>
  SetMetadata(ABILITY_KEY, abilities);
