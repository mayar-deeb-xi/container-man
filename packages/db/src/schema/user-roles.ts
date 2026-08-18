import { relations } from "drizzle-orm";
import { index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { roles } from "./roles";
import { users } from "./users";

/**
 * Which roles a user holds. This table replaced the `users.role` enum: a user has
 * as many roles as an operator gives them, and their abilities are the union of
 * what those roles grant.
 *
 * There is no "primary" role and no ordering. CASL unions rules and lets inverted
 * ones win, so precedence is a property of the rules rather than of the assignment
 * — which means adding a role can never quietly *reduce* what a user may do.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    /**
     * Who granted it. `set null` rather than cascade: the fact that an assignment
     * was made outlives the account that made it, and losing the row would erase
     * the assignment itself along with its provenance.
     */
    assignedById: uuid("assigned_by_id").references(() => users.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    // "Who holds this role" — asked by the roles list, and before a delete.
    index("user_roles_role_id_idx").on(table.roleId),
  ],
);

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
    relationName: "userRoleHolder",
  }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
  assignedBy: one(users, {
    fields: [userRoles.assignedById],
    references: [users.id],
    relationName: "userRoleGrantor",
  }),
}));

export type UserRoleAssignment = typeof userRoles.$inferSelect;
export type NewUserRoleAssignment = typeof userRoles.$inferInsert;
