import { relations, sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "user"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always stored lowercased — normalize on the way in, never on the way out. */
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    role: userRole("role").notNull().default("user"),
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
     * repeats the predicate — which is why seed.ts passes `targetWhere`.
     */
    uniqueIndex("users_email_idx")
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** Doubles as the refresh token's `jti`, so rotation is a primary-key lookup. */
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the issued refresh token — the raw token is never stored. */
    refreshTokenHash: text("refresh_token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /**
     * Session that superseded this one during rotation. Its presence is what
     * separates a benign race (two tabs refreshing at once) from actual token
     * theft — see the grace window in AuthService.refresh. Intentionally has no
     * FK constraint so revoked ancestors can be pruned independently.
     */
    replacedById: uuid("replaced_by_id"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
