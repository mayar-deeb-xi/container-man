import { hashPassword } from "@repo/auth/password";

import { db } from "./client";
import { users } from "./schema";

/**
 * There is no public registration endpoint, so this script is the only way a
 * user gets created. It upserts on email, which makes `pnpm db:seed` safe to
 * re-run — handy for resetting the admin password during development.
 */
async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "password123";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (password.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters.");
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, name, role: "admin" })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash, name, role: "admin" },
    })
    .returning({ id: users.id, email: users.email, role: users.role });

  console.log(`Seeded admin user: ${user?.email} (${user?.id})`);
  console.log(`Password: ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
