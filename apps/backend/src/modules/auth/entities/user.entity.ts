import { Exclude, Expose, Type } from "class-transformer";

import type { AppAction, AppSubject } from "@repo/access";

/** A role the signed-in user holds, reduced to what the console needs to name it. */
@Exclude()
export class SessionRoleEntity {
  @Expose() id: string;
  @Expose() key: string;
  @Expose() name: string;
}

/**
 * One CASL rule, as the browser receives it.
 *
 * Sending rules rather than a list of permission names is what lets the console build
 * the *same* ability the backend enforces with: `<Can I="update" this={container}>`
 * evaluates the conditions locally instead of guessing from a flat list. Placeholders
 * are already resolved for this user by the time they get here.
 */
@Exclude()
export class SessionRuleEntity {
  @Expose() action: AppAction;
  @Expose() subject: AppSubject;
  @Expose() conditions?: Record<string, unknown> | null;
  @Expose() fields?: string[] | null;
}

/**
 * Serialization allowlist for the identity the auth endpoints hand back — the
 * answer to "who am I", which is what `/auth/me` returns.
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
 *
 * `roles` and `rules` are here rather than in the access token because a token is
 * valid for fifteen minutes and authorization cannot be: this endpoint is a live read,
 * so a revoked role reaches the UI on the next poll instead of at expiry.
 */
@Exclude()
export class UserEntity {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() name: string | null;

  @Expose()
  @Type(() => SessionRoleEntity)
  roles: SessionRoleEntity[];

  @Expose()
  @Type(() => SessionRuleEntity)
  rules: SessionRuleEntity[];
}
