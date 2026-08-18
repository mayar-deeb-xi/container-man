import { notInArray, sql } from "drizzle-orm";

import { PERMISSION_CATALOG, permissionKey, SYSTEM_ROLES } from "@repo/access";

import { db } from "../client";
import { permissions, rolePermissions, roles } from "../schema";

/**
 * Brings the permission catalog and the system roles in line with `@repo/access`.
 *
 * The catalog is a *projection* of `PERMISSION_CATALOG`, so this reconciles in both
 * directions: pairs added in code appear as rows, and pairs removed from code are
 * deleted — taking their grants with them via the cascade on `role_permissions`.
 * Leaving stale rows behind would offer an operator a checkbox for a permission
 * nothing checks, which is worse than the grant disappearing.
 *
 * Safe to re-run, and re-running is how a deployment picks up a new subject.
 */
export async function seedRoles(): Promise<void> {
  const catalog = await db
    .insert(permissions)
    .values(
      PERMISSION_CATALOG.map((entry) => ({
        action: entry.action,
        subject: entry.subject,
        description: entry.description,
      })),
    )
    .onConflictDoUpdate({
      target: [permissions.action, permissions.subject],
      // `excluded` is the row Postgres was about to insert, so the description comes
      // from the statement itself — the alternative is a CASE over every pair in the
      // catalog, kept in step by hand.
      set: { description: sql`excluded.description` },
    })
    .returning({ id: permissions.id, action: permissions.action, subject: permissions.subject });

  const removed = await db
    .delete(permissions)
    .where(
      notInArray(
        permissions.id,
        catalog.map((row) => row.id),
      ),
    )
    .returning({ action: permissions.action, subject: permissions.subject });

  for (const row of removed) {
    console.log(`Removed retired permission: ${permissionKey(row.action, row.subject)}`);
  }

  const byKey = new Map(catalog.map((row) => [permissionKey(row.action, row.subject), row.id]));

  for (const definition of SYSTEM_ROLES) {
    // `description` and `is_system` are re-asserted, `name` is not: an install may
    // rename a role through the console, and a seed that undid that on every deploy
    // would look like the console silently failing to save.
    const [role] = await db
      .insert(roles)
      .values({
        key: definition.key,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      })
      .onConflictDoUpdate({
        target: roles.key,
        set: { description: definition.description, isSystem: true },
      })
      .returning({ id: roles.id, key: roles.key });

    if (!role) continue;

    const grants = definition.rules
      .map((rule) => byKey.get(permissionKey(rule.action, rule.subject)))
      .filter((id): id is string => id !== undefined)
      .map((permissionId) => ({ roleId: role.id, permissionId }));

    if (grants.length > 0) {
      // Baseline, not a reset: a system role's grants are topped up to at least what
      // the definition says. `admin` is the one that matters — `manage all` has to
      // exist or nobody can administer the install — and the API refuses to strip it.
      await db.insert(rolePermissions).values(grants).onConflictDoNothing();
    }

    console.log(`Seeded system role: ${role.key} (${grants.length} baseline permissions)`);
  }
}
