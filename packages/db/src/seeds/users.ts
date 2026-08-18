import { eq, sql } from "drizzle-orm";

import { SUPER_ROLE_KEY } from "@repo/access";
import { hashPassword } from "@repo/auth/password";

import { db } from "../client";
import { roles, userRoles, users } from "../schema";

/**
 * There is no public registration endpoint, so this seed is the only way the
 * first user gets created. It upserts on email, which makes `pnpm db:seed` safe
 * to re-run — handy for resetting the admin password during development.
 *
 * It also re-grants the `admin` role, which is what makes re-running the seed the
 * documented way back in after an operator has locked themselves out. Runs after
 * `seedRoles`, since the role it assigns has to exist first.
 */
export async function seedUsers(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "password123";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (password.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters.");
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, name })
    .onConflictDoUpdate({
      target: users.email,
      // The email index is partial, and Postgres only infers a partial index when
      // the statement repeats its predicate — without this the upsert raises
      // "no unique or exclusion constraint matching the ON CONFLICT".
      targetWhere: sql`${users.deletedAt} is null`,
      // Undeletes the admin too: re-running the seed is how a locked-out operator
      // gets back in, and a soft-deleted row would otherwise be unreachable.
      set: { passwordHash, name, deletedAt: null },
    })
    .returning({ id: users.id, email: users.email });

  if (!user) {
    throw new Error("Seeding the admin user returned no row.");
  }

  const [adminRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, SUPER_ROLE_KEY))
    .limit(1);

  if (!adminRole) {
    throw new Error(`The "${SUPER_ROLE_KEY}" role is missing — run seedRoles first.`);
  }

  // `assignedById` is left null: the first grant has no granter, and pointing it at
  // the user themselves would read as a self-promotion in the audit trail.
  await db
    .insert(userRoles)
    .values({ userId: user.id, roleId: adminRole.id })
    .onConflictDoNothing();

  console.log(`Seeded admin user: ${user.email} (${user.id})`);
  console.log(`Password: ${password}`);
}
