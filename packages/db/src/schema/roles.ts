import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { rolePermissions } from "./role-permissions";
import { userRoles } from "./user-roles";

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Stable, lowercase identifier — what code refers to (`admin`) as opposed to
     * what an operator reads (`Administrator`). Separating the two is what lets a
     * role be renamed without breaking the seed, the guards, or a saved query.
     */
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Seeded by `@repo/access`'s `SYSTEM_ROLES` and refused by every delete path.
     * An install with no roles is an install nobody can administer, so the two the
     * seed creates are permanent; their names and (except for `admin`) their
     * permissions stay editable.
     */
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Plain unique, not partial like `users_email_idx`: roles are hard-deleted, so
  // there is no soft-deleted row for the predicate to exclude.
  (table) => [uniqueIndex("roles_key_idx").on(table.key)],
);

/**
 * Deleting a role is a real delete — the join rows cascade with it. Unlike a user,
 * a role is not referenced by anything that needs its name preserved after the
 * fact, so there is nothing for a soft delete to protect.
 */
export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  users: many(userRoles),
}));

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
