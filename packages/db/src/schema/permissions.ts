import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { AppAction, AppSubject } from "@repo/access";

import { rolePermissions } from "./role-permissions";

/**
 * The catalog of grantable permissions — one row per (action, subject) pair.
 *
 * It is a projection of `PERMISSION_CATALOG` in `@repo/access`, upserted by the
 * role seed, and not a place new pairs get invented: the vocabulary has to be
 * known to the code that enforces it, so it lives in TypeScript and the table
 * exists to give `role_permissions` something to point at.
 *
 * Storing them at all — rather than putting the strings straight on the join row —
 * buys referential integrity: a typo'd action cannot be saved, and a pair removed
 * from the catalog takes its grants with it instead of lingering as a rule nothing
 * will ever check.
 */
export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * `manage` is CASL's "any action" wildcard; the rest are ordinary verbs.
     *
     * `text` with a `$type`, not a `pgEnum`: the vocabulary lives in `@repo/access`,
     * and an enum would mean a migration every time a subject is added — while the
     * catalog seed already reconciles the rows. The type keeps queries honest;
     * `isAction`/`isSubject` are what check the data that comes back, since a column
     * type is a claim about the column, not a constraint on it.
     */
    action: text("action").$type<AppAction>().notNull(),
    /** `all` is CASL's "any subject" wildcard. See `action` for why this is `text`. */
    subject: text("subject").$type<AppSubject>().notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("permissions_action_subject_idx").on(table.action, table.subject)],
);

export const permissionsRelations = relations(permissions, ({ many }) => ({
  roles: many(rolePermissions),
}));

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
