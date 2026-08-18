import { Exclude, Expose, Type } from "class-transformer";

import type { AppAction, AppSubject } from "@repo/access";

/**
 * One rule a role grants, as the console reads it.
 *
 * `action` and `subject` rather than the catalog row's id: the id is a join detail,
 * while the pair is what the matrix draws and what CASL evaluates. `permissionId` is
 * exposed alongside so a client can key its checkboxes off the catalog it fetched
 * without rebuilding the pair into a string.
 */
@Exclude()
export class RoleRuleEntity {
  @Expose() permissionId: string;
  @Expose() action: AppAction;
  @Expose() subject: AppSubject;
  @Expose() conditions: Record<string, unknown> | null;
  @Expose() fields: string[] | null;
  @Expose() inverted: boolean;
  @Expose() reason: string | null;
}

/**
 * Serialization allowlist for a role in a list — enough to render a row, without the
 * rule set that would make a page of roles a page of matrices.
 *
 * The two counts are what turn the list into something an operator can act on: how
 * much a role grants, and how many people it would affect. Both are computed in the
 * list query rather than fetched per row.
 */
@Exclude()
export class RoleEntity {
  @Expose() id: string;
  @Expose() key: string;
  @Expose() name: string;
  @Expose() description: string | null;
  /** System roles cannot be deleted; the console greys the action rather than 409ing. */
  @Expose() isSystem: boolean;
  /**
   * True for the one role whose rules are fixed in code (`SUPER_ROLE_KEY`). Sent as a
   * flag rather than left for the client to infer from the key: which role is the
   * superuser is a backend fact, and a client comparing against a hard-coded "admin"
   * would silently disagree with an install that renamed it.
   */
  @Expose() isLocked: boolean;
  @Expose() permissionCount: number;
  @Expose() userCount: number;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;
}

/**
 * A single role with everything it grants — what the matrix editor loads.
 *
 * Written out rather than extending `RoleEntity`, as every entity in this codebase
 * is: the list shape and the detail shape answer different questions, and inheritance
 * would mean a field added for one appears in the other without anyone deciding it
 * should.
 */
@Exclude()
export class RoleDetailEntity {
  @Expose() id: string;
  @Expose() key: string;
  @Expose() name: string;
  @Expose() description: string | null;
  @Expose() isSystem: boolean;
  @Expose() isLocked: boolean;
  @Expose() userCount: number;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  // `@Type` is what makes the nested allowlist run — without it the rules would be
  // serialized as whatever the service happened to select.
  @Expose()
  @Type(() => RoleRuleEntity)
  rules: RoleRuleEntity[];
}
