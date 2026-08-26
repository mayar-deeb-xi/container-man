import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * A company that delivers e-waste to the yard.
 *
 * The paper form this feature digitizes said "write the supplier's *number*, never the
 * name — confidentiality". That was access control by omission, which is all paper has.
 * Here the name is a column and confidentiality is a permission: goods-in responses
 * embed only `code`, and reading the full supplier record is its own grant
 * (`read Supplier`). Leaving the name out of the database would not have protected it —
 * it would only have moved it to a sticky note next to the code list.
 */
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * The internal supplier number, e.g. `S014` — what goods-in staff see and what the
     * paperwork carries. Stored uppercase; the DTO normalizes on the way in.
     */
    code: text("code").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    /**
     * Soft delete, as everywhere else. Deleting is for a supplier that should never have
     * been entered — and the API refuses it once any delivery references the row, because
     * a goods-in record must keep resolving its supplier for as long as it is kept.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    /**
     * Partial, exactly like `containers_number_idx`: a code is unique among live rows,
     * so deleting a mistyped supplier frees its code for re-entry.
     */
    uniqueIndex("suppliers_code_idx")
      .on(table.code)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
