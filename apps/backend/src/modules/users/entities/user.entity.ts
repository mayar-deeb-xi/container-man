import { Exclude, Expose, Type } from "class-transformer";

import type { AppAction, AppSubject } from "@repo/access";

/**
 * A role on a user, reduced to what a row or a chip needs. The rules behind it are
 * not included: a page of users would become a page of rule sets, and what a role
 * grants is the roles console's subject, not this one's.
 */
@Exclude()
export class UserRoleEntity {
  @Expose() id: string;
  @Expose() key: string;
  @Expose() name: string;
}

/**
 * Serialization allowlist for the user-management payload: the account record as
 * an operator sees it, with the timestamps that make a list of accounts legible.
 *
 * Every field is written out rather than inherited from the auth module's entity
 * of the same name. The two answer different questions — "who am I" versus "what
 * is this account" — and inheritance would tie them together, so a field exposed
 * for one would silently appear in the other. Spelling both out costs four lines
 * and makes each module's wire format readable in one place.
 *
 * Only `@Expose`d fields reach the wire, and the service hands the interceptor a
 * whole `users` row — so this list is the only thing standing between
 * `passwordHash` and the response. Adding a column to the table is safe by
 * default; exposing it here is the deliberate act.
 *
 * `deletedAt` is absent for that reason and one more: these endpoints only ever
 * return live rows, so a field that is always null would just invite a client to
 * branch on it.
 */
@Exclude()
export class UserEntity {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() name: string | null;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  /**
   * Every role the user holds. This replaced a single `role` field, and the plural is
   * the whole point: abilities are the union of what these grant, so there is no
   * primary one to single out. `@Type` is what makes the nested allowlist run.
   */
  @Expose()
  @Type(() => UserRoleEntity)
  roles: UserRoleEntity[];
}

/**
 * One rule from a user's effective rule set — what their roles add up to, after
 * placeholders are resolved.
 *
 * Serialized through an allowlist like everything else, even though these objects are
 * built by `@repo/access` rather than read from a table. Consistency is the point: a
 * route that returns something un-allowlisted is the exception nobody notices, and the
 * shape here is the wire contract the console's `<Can>` is built against.
 */
@Exclude()
export class EffectiveRuleEntity {
  @Expose() action: AppAction;
  @Expose() subject: AppSubject;
  @Expose() conditions?: Record<string, unknown> | null;
  @Expose() fields?: string[] | null;
}
