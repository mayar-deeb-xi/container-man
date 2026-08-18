import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { permissions } from "./permissions";
import { roles } from "./roles";

/**
 * What a role grants — a CASL rule, stored.
 *
 * The composite primary key means one rule per (role, permission): a matrix cell
 * is either granted or it is not, and a role cannot hold two contradictory rules
 * for the same pair. Overlapping allow/deny for one action on one subject is not
 * something an operator can express usefully, so making it unrepresentable keeps
 * the editor honest.
 */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    /**
     * MongoDB-style query CASL matches against the subject instance, which is what
     * turns "update Container" into "update the containers you own".
     *
     * Values may contain `${user.id}` placeholders, resolved per request by
     * `packRules` in `@repo/access` — the row is a template, not a fact, so the
     * same rule serves every user who holds the role.
     */
    conditions: jsonb("conditions").$type<Record<string, unknown>>(),
    /**
     * Narrows the rule to these columns; null grants the whole subject.
     *
     * Write-side only, and the API refuses to store it on any action but `update` — see
     * `FIELD_SCOPED_ACTION` in `@repo/access`. Two entries are not columns at all:
     * `User.roles` and `Role.permissions` name the endpoints that hand out privilege, so a
     * role can grant "may edit the account, may not change what it can do".
     */
    fields: text("fields").array(),
    /**
     * A deny rule, and the reason "everything except the admins" is two rows rather than
     * an enumeration.
     *
     * Precedence over an overlapping allow is not something CASL does by itself — it
     * resolves overlaps by rule order — so `AbilityService.forUser` sorts these last when
     * it resolves a user's roles. Without that, a user holding one role that grants an
     * action and another that denies it would get whichever the join happened to return
     * last.
     */
    inverted: boolean("inverted").notNull().default(false),
    /** Surfaced to the user when an inverted rule is what refused them. */
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    // The primary key already covers lookups by role — this one is for the reverse
    // question, which the catalog needs before it lets a permission be removed.
    index("role_permissions_permission_id_idx").on(table.permissionId),
  ],
);

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
