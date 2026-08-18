import { eq, inArray, sql } from "drizzle-orm";

import type { AppAction, AppSubject } from "@repo/access";
import { permissionKey, SUPER_ROLE_KEY } from "@repo/access";
import { hashPassword } from "@repo/auth/password";

import { db } from "../client";
import { permissions, rolePermissions, roles, userRoles, users } from "../schema";
import { removeDemoContainers, seedDemoContainers } from "./containers";

/**
 * Demo data: the roles and accounts you need to actually exercise authorization.
 *
 * Separate from the other seeds because it is *not* part of a working install. One admin
 * is the minimum an install needs to be usable, and `seedUsers` provides it; everything
 * here exists to be clicked on, broken, and deleted. Keeping it in its own file is what
 * lets it be skipped without threading a flag through the seeds that matter.
 *
 * The roles are deliberately non-system, so the console can delete them — a developer
 * should be able to try that, and get the "users hold this role" refusal, without
 * touching anything an install depends on.
 */

interface DemoRole {
  key: string;
  name: string;
  description: string;
  /** Grants, as catalog pairs. Every one must exist in `PERMISSION_CATALOG`. */
  rules: readonly { action: AppAction; subject: AppSubject }[];
}

/**
 * Four shapes worth having on hand, chosen to be different from each other in ways that
 * matter rather than to enumerate the catalog:
 *
 * - `operator` shows `manage` standing in for every verb on one subject.
 * - `viewer` is the narrowest useful role — one grant.
 * - `auditor` reads across subjects without being able to change any of them.
 * - `user-manager` can administer accounts but not what a role means, which is the split
 *   `PUT /users/:id/roles` depends on: it requires `update Role` too, so this role
 *   deliberately cannot assign roles. That refusal is the interesting part.
 */
const DEMO_ROLES: readonly DemoRole[] = [
  {
    key: "operator",
    name: "Operator",
    description: "Runs the containers, and can see who else is on the console.",
    rules: [
      { action: "manage", subject: "Container" },
      { action: "read", subject: "User" },
    ],
  },
  {
    key: "viewer",
    name: "Viewer",
    description: "Read-only access to the containers.",
    rules: [{ action: "read", subject: "Container" }],
  },
  {
    key: "auditor",
    name: "Auditor",
    description: "Reads everything, changes nothing.",
    rules: [
      { action: "read", subject: "Container" },
      { action: "read", subject: "User" },
      { action: "read", subject: "Role" },
    ],
  },
  {
    key: "user-manager",
    name: "User manager",
    description: "Creates and edits accounts. Cannot assign roles — that needs Roles too.",
    rules: [
      { action: "read", subject: "User" },
      { action: "create", subject: "User" },
      { action: "update", subject: "User" },
      { action: "read", subject: "Role" },
    ],
  },
];

interface DemoUser {
  email: string;
  name: string;
  /** Role keys, resolved after the roles above are seeded. `[]` is a deliberate state. */
  roleKeys: readonly string[];
}

/**
 * Accounts covering the states the console has to render, not just the happy one.
 *
 * The second administrator is the load-bearing one: the API refuses to let anyone edit
 * their own roles or delete their own account, so without a second admin there is no way
 * to exercise the role editor or the delete flow at all. The account with no roles is the
 * other end — it can sign in and reach nothing, which is what an operator sees after
 * revoking the last role rather than a broken page.
 */
const DEMO_USERS: readonly DemoUser[] = [
  { email: "alex.admin@example.com", name: "Alex Admin", roleKeys: [SUPER_ROLE_KEY] },
  { email: "olivia.operator@example.com", name: "Olivia Operator", roleKeys: ["operator"] },
  { email: "victor.viewer@example.com", name: "Victor Viewer", roleKeys: ["viewer"] },
  // Two roles on purpose: abilities are the union, so this account is the one that shows
  // a widened grant, and the one whose row has more than one chip in it.
  { email: "audrey.auditor@example.com", name: "Audrey Auditor", roleKeys: ["auditor", "viewer"] },
  { email: "maya.manager@example.com", name: "Maya Manager", roleKeys: ["user-manager"] },
  { email: "noah.newcomer@example.com", name: "Noah Newcomer", roleKeys: [] },
];

/**
 * Whether to seed any of this.
 *
 * `SEED_DEMO` wins when set, so a developer can opt out. Otherwise it follows the
 * environment: in production these are accounts with a shared, published password, and
 * creating them silently there would be the worst kind of convenience. Opting in has to
 * be deliberate.
 */
export function shouldSeedDemo(): boolean {
  const flag = process.env.SEED_DEMO;
  if (flag !== undefined) return flag === "true" || flag === "1";
  return process.env.NODE_ENV !== "production";
}

export async function seedDemo(): Promise<void> {
  if (!shouldSeedDemo()) {
    console.log("Skipping demo data (set SEED_DEMO=true to create it).");
    return;
  }

  const password = process.env.SEED_DEMO_PASSWORD ?? "password123";
  if (password.length < 8) {
    throw new Error("SEED_DEMO_PASSWORD must be at least 8 characters.");
  }

  // One hash for every demo account: argon2 is deliberately slow, and six sequential
  // hashes is most of this seed's runtime for no benefit — they all share the password
  // anyway, and it is printed below.
  const passwordHash = await hashPassword(password);

  const catalog = await db
    .select({ id: permissions.id, action: permissions.action, subject: permissions.subject })
    .from(permissions);

  const permissionIdByKey = new Map(
    catalog.map((row) => [permissionKey(row.action, row.subject), row.id]),
  );

  for (const definition of DEMO_ROLES) {
    const [role] = await db
      .insert(roles)
      .values({
        key: definition.key,
        name: definition.name,
        description: definition.description,
        isSystem: false,
      })
      .onConflictDoUpdate({
        // `name` is left alone, as in `seedRoles`: renaming a role through the console is
        // a legitimate edit, and a seed that undid it on every run would look like the
        // console failing to save.
        target: roles.key,
        set: { description: definition.description },
      })
      .returning({ id: roles.id, key: roles.key });

    if (!role) continue;

    const grants = definition.rules
      .map((rule) => permissionIdByKey.get(permissionKey(rule.action, rule.subject)))
      .filter((id): id is string => id !== undefined)
      .map((permissionId) => ({ roleId: role.id, permissionId }));

    if (grants.length !== definition.rules.length) {
      throw new Error(
        `Demo role "${definition.key}" names a permission that is not in the catalog — run seedRoles first.`,
      );
    }

    // Topped up, not replaced: a developer who unticked a box in the matrix should not
    // find it back purely because someone re-ran the seed for the users.
    await db.insert(rolePermissions).values(grants).onConflictDoNothing();
  }

  const roleIdByKey = new Map(
    (
      await db
        .select({ id: roles.id, key: roles.key })
        .from(roles)
        .where(
          inArray(roles.key, [SUPER_ROLE_KEY, ...DEMO_ROLES.map((definition) => definition.key)]),
        )
    ).map((row) => [row.key, row.id]),
  );

  for (const definition of DEMO_USERS) {
    const [user] = await db
      .insert(users)
      .values({ email: definition.email, passwordHash, name: definition.name })
      .onConflictDoUpdate({
        target: users.email,
        // The email index is partial, and Postgres only infers a partial index when the
        // statement repeats its predicate — see the same note in `seedUsers`.
        targetWhere: sql`${users.deletedAt} is null`,
        // Undeletes, so a developer who deleted a demo account through the console gets it
        // back by re-running the seed rather than by editing rows by hand.
        set: { passwordHash, name: definition.name, deletedAt: null },
      })
      .returning({ id: users.id, email: users.email });

    if (!user) continue;

    const assignments = definition.roleKeys
      .map((key) => roleIdByKey.get(key))
      .filter((id): id is string => id !== undefined)
      .map((roleId) => ({ userId: user.id, roleId }));

    if (assignments.length > 0) {
      await db.insert(userRoles).values(assignments).onConflictDoNothing();
    }

    console.log(
      `Seeded demo user: ${user.email}` +
        (definition.roleKeys.length > 0 ? ` (${definition.roleKeys.join(", ")})` : " (no roles)"),
    );
  }

  // Last, because the fleet is assigned to the accounts created just above.
  await seedDemoContainers();

  console.log(`Demo password: ${password}`);
}

/**
 * Removes the demo roles and soft-deletes the demo accounts.
 *
 * Not wired into `pnpm db:seed` — it is here for the moment someone wants their console
 * back to just the admin, and for the same reason the seed prints what it created: demo
 * data should be as easy to take out as it was to put in.
 *
 * Exported rather than run: call it from a script or `db:studio` session.
 */
export async function removeDemo(): Promise<void> {
  const emails = DEMO_USERS.map((definition) => definition.email);

  // Soft, not hard, matching what `DELETE /users/:id` does — sessions and any row that
  // points at a user keep resolving to a name.
  const removed = await db
    .update(users)
    .set({ deletedAt: new Date() })
    .where(inArray(users.email, emails))
    .returning({ email: users.email });

  for (const key of DEMO_ROLES.map((definition) => definition.key)) {
    await db.delete(roles).where(eq(roles.key, key));
  }

  await removeDemoContainers();

  console.log(`Removed ${removed.length} demo accounts and ${DEMO_ROLES.length} demo roles.`);
}
