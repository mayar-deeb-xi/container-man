import type { Request } from "express";

import type { AppAbility } from "@repo/access";
import type { AccessTokenPayload, RefreshTokenPayload } from "@repo/auth";

import type { RoleSummary } from "../../lib/ability/ability.service";

export interface RequestWithUser extends Request {
  user: AccessTokenPayload;
  /**
   * Attached by `AbilityGuard`, so both are absent on a route that only runs
   * `JwtAccessGuard`. Optional for that reason rather than as a convenience —
   * `@CurrentAbility()` throws instead of papering over the missing guard.
   */
  ability?: AppAbility;
  roles?: RoleSummary[];
}

export interface RequestWithRefresh extends Request {
  refresh: {
    payload: RefreshTokenPayload;
    /** The raw token, needed to compare against the stored SHA-256 digest. */
    token: string;
  };
}
