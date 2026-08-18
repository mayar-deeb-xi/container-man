import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { AppAbility, AppRule, RuleContext } from "@repo/access";
import { createAppAbility, isAction, isSubject, packRules } from "@repo/access";
import { permissions, rolePermissions, roles, userRoles, users } from "@repo/db";

import type { Database } from "../db/db.module";
import { DRIZZLE } from "../db/db.module";

/** A role as anything that needs to *name* one sees it. */
export interface RoleSummary {
  id: string;
  key: string;
  name: string;
}

/** Everything a caller needs to know about what one user may do. */
export interface UserAccess {
  roles: RoleSummary[];
  /** Resolved rules — placeholders substituted, ready for CASL or the wire. */
  rules: AppRule[];
}

/**
 * Resolves a user's roles into a CASL ability.
 *
 * The rules are read from the database on every request that needs them rather than
 * cached or carried in the token. That is the whole point of the design: an operator
 * who removes a role expects it to take effect now, and any copy of the rules —
 * a JWT claim, an in-process map — is a window in which it has not. The cost is two
 * indexed queries on the routes that are actually guarded.
 *
 * It lives in `lib/` rather than in a feature module because the guards need it and
 * guards belong to no module; `lib/db` is here for the same reason.
 */
@Injectable()
export class AbilityService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Both halves of what a user may do, in the two queries it takes.
   *
   * Returns `null` when the user does not exist or has been soft-deleted, which is
   * what lets the guard answer 401 for a token whose subject is gone — an access
   * token stays syntactically valid for fifteen minutes after the account behind it
   * was deleted.
   */
  async forUser(userId: string): Promise<UserAccess | null> {
    const [user] = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) return null;

    const rows = await this.db
      .select({
        roleId: roles.id,
        roleKey: roles.key,
        roleName: roles.name,
        action: permissions.action,
        subject: permissions.subject,
        conditions: rolePermissions.conditions,
        fields: rolePermissions.fields,
        inverted: rolePermissions.inverted,
        reason: rolePermissions.reason,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      // Left, not inner: a role with no permissions yet still has to appear in the
      // list, or the console would show a user as holding nothing.
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, userId));

    const roleById = new Map<string, RoleSummary>();
    const stored: AppRule[] = [];

    for (const row of rows) {
      roleById.set(row.roleId, { id: row.roleId, key: row.roleKey, name: row.roleName });

      // The action and subject are `text` columns, so the vocabulary is enforced by
      // the catalog rather than by the type system. A row naming something outside
      // it is dropped: a permission retired in code should stop granting, and
      // handing CASL an unknown verb would make it grant something nobody meant.
      if (!isAction(row.action) || !isSubject(row.subject)) continue;

      stored.push({
        action: row.action,
        subject: row.subject,
        conditions: row.conditions,
        fields: row.fields,
        inverted: row.inverted ?? false,
        reason: row.reason,
      });
    }

    const context: RuleContext = { user: { id: user.id, email: user.email } };

    // Denies last, and this is load-bearing. CASL resolves overlapping rules by order —
    // the *last* matching rule wins, not the inverted one — so with the rows in whatever
    // order the join returned, a user holding both a role that grants `delete Container`
    // and one that forbids it would get whichever the planner happened to emit last.
    // Sorting the inverted rules to the end makes a deny beat every allow it overlaps,
    // which is what every comment about inverted rules in this codebase assumes, and what
    // lets a restriction be expressed as one extra role rather than by editing the others.
    //
    // A stable sort, so rules that share an `inverted` value keep their relative order:
    // among denies, or among allows, precedence is not something an operator can see or
    // control, and it must not silently depend on row order either.
    const ordered = [...stored].sort(
      (a, b) => Number(a.inverted ?? false) - Number(b.inverted ?? false),
    );

    return {
      roles: [...roleById.values()].sort((a, b) => a.name.localeCompare(b.name)),
      rules: packRules(ordered, context),
    };
  }

  /** The ability alone, for a caller that only needs to ask `can`. */
  async abilityFor(userId: string): Promise<AppAbility | null> {
    const access = await this.forUser(userId);
    return access ? createAppAbility(access.rules) : null;
  }
}
