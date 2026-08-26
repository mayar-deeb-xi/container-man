import { relations, sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { DeliveryStatus, GoodsDocType } from "@repo/goods-in";
import { DELIVERY_STATUSES, GOODS_DOC_TYPES } from "@repo/goods-in";

import { suppliers } from "./suppliers";
import { users } from "./users";

/**
 * The enum values come from `@repo/goods-in` for the same reason the container enums
 * come from `@repo/shipping`: the column, the DTO validator and the console's selects
 * must not be able to disagree. The cast bridges drizzle's mutable-tuple expectation
 * and the vocabulary's `readonly` one.
 */
export const deliveryStatus = pgEnum(
  "delivery_status",
  DELIVERY_STATUSES as unknown as [DeliveryStatus],
);
export const goodsDocType = pgEnum("goods_doc_type", GOODS_DOC_TYPES as unknown as [GoodsDocType]);

/**
 * One incoming delivery — a lorry's worth of e-waste, checked in pallet by pallet.
 *
 * The header of the paper goods-in form, without its paper workarounds: the form
 * composed a "Delivery ID" out of date, supplier number and delivery number
 * (`WE-260713-S014-0091`) because paper has no foreign keys. Here those are columns,
 * the identity is `id`, and the human-facing reference is `GI-` plus `delivery_no`,
 * formatted at read time — correcting a mistyped date or supplier never breaks it.
 */
export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * The sequential register number, assigned by the database rather than by whoever
     * is holding the clipboard. `GENERATED ALWAYS` so nothing can hand-pick one; gaps
     * (from deleted drafts) are acceptable, duplicates are not.
     */
    deliveryNo: integer("delivery_no").notNull().generatedAlwaysAsIdentity(),
    /**
     * `restrict` rather than `set null` or cascade: a goods-in record that has lost its
     * supplier is a record that no longer says who delivered — worthless for the ten
     * years it must be kept. Suppliers are only ever soft-deleted anyway, and the API
     * refuses even that while deliveries reference the row.
     */
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    /** The day the lorry arrived. A date, not a timestamp — the form records a day. */
    deliveredOn: date("delivered_on", { mode: "string" }).notNull(),
    /** The supplier's batch/lot number, when the paperwork carries one. Free text. */
    lotNo: text("lot_no"),
    /**
     * Which papers physically arrived with the delivery — the form's "Documents
     * attached (Nr.)" without the numbered legend. An enum array rather than a join
     * table because this records a checklist, not files; scanned documents come later
     * and will reference `(delivery, docType)` when they do.
     */
    documents: goodsDocType("documents")
      .array()
      .notNull()
      .default(sql`'{}'::goods_doc_type[]`),
    status: deliveryStatus("status").notNull().default("draft"),
    /**
     * Who signed the completed record, and when — the "Signature Worker" field of the
     * form, as an authenticated fact rather than handwriting. Set exactly once, by the
     * sign endpoint; from then on the row and its pallets are immutable. `restrict`
     * because losing the signer would un-sign ten years of records.
     */
    signedById: uuid("signed_by_id").references(() => users.id, { onDelete: "restrict" }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    /**
     * Soft delete — for a *draft* entered by mistake. The API refuses to delete a signed
     * delivery outright: signed records are the ones GoBD says are kept unaltered.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // Total, not partial: the number is a register entry and is never reissued, so a
    // deleted draft keeps its number in the trash rather than freeing it for reuse.
    uniqueIndex("deliveries_delivery_no_idx").on(table.deliveryNo),
    // "This supplier's deliveries" — the join the supplier-delete check and the list
    // filter both make.
    index("deliveries_supplier_id_idx").on(table.supplierId),
    index("deliveries_status_idx").on(table.status),
    index("deliveries_delivered_on_idx").on(table.deliveredOn),
  ],
);

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  supplier: one(suppliers, { fields: [deliveries.supplierId], references: [suppliers.id] }),
  signedBy: one(users, { fields: [deliveries.signedById], references: [users.id] }),
}));

export type Delivery = typeof deliveries.$inferSelect;
export type NewDelivery = typeof deliveries.$inferInsert;
