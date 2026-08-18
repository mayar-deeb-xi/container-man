import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { sessions } from "./sessions";
import { userRoles } from "./user-roles";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always stored lowercased — normalize on the way in, never on the way out. */
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    /**
     * Soft delete. Rows are never removed: sessions — and anything that later
     * points at a user — would otherwise lose the name behind the id. Every read
     * path is expected to filter on this being null; see `UsersService`.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    /**
     * Partial on purpose: uniqueness binds live rows only, so deleting a user
     * frees their address for re-use. A plain unique index would make a soft
     * delete reserve the email forever, which is indistinguishable from a bug to
     * whoever tries to re-create the account.
     *
     * Postgres only picks a partial index for `ON CONFLICT` when the statement
     * repeats the predicate — which is why seeds/users.ts passes `targetWhere`.
     */
    uniqueIndex("users_email_idx")
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
  ],
);

/**
 * `sessions` is imported from a module that imports this one back. The cycle is
 * safe because drizzle only invokes this callback when it builds the relational
 * schema, long after both modules have finished evaluating.
 *
 * There is no `role` column: what a user may do comes from `user_roles`, because
 * one enum value per user cannot express "operator *and* auditor". The names have
 * to be spelled out because `user_roles` points at this table twice — once for the
 * holder, once for whoever granted the assignment.
 */
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  roles: many(userRoles, { relationName: "userRoleHolder" }),
  rolesGranted: many(userRoles, { relationName: "userRoleGrantor" }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
