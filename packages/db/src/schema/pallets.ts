import { relations } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { PackingType, WasteClassification, WeeeCategory } from "@repo/goods-in";
import { PACKING_TYPES, WASTE_CLASSIFICATIONS } from "@repo/goods-in";

import { deliveries } from "./deliveries";
import { users } from "./users";

export const packingType = pgEnum("packing_type", PACKING_TYPES as unknown as [PackingType]);
export const wasteClassification = pgEnum(
  "waste_classification",
  WASTE_CLASSIFICATIONS as unknown as [WasteClassification],
);

/**
 * One checked pallet — a line of the goods-in form.
 *
 * A line item of its delivery, not a resource of its own: it is only ever reached
 * through `/deliveries/:id/pallets`, its authorization is the delivery's, and deleting
 * one from a draft is a hard delete — a line struck from an unfinished form was never
 * part of any record. Once the delivery is signed, no write here is accepted at all.
 */
export const pallets = pgTable(
  "pallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Cascade: pallets of a hard-deleted delivery have nothing left to be lines of. */
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    /**
     * Position within the delivery, 1-based — rendered as `P01`. Assigned by the
     * service (max + 1); the unique index below is what settles two stations adding
     * to the same delivery at once.
     */
    palletNo: integer("pallet_no").notNull(),
    packing: packingType("packing").notNull(),
    /** What is on the pallet, for humans — "defective monitors, mixed brands". */
    material: text("material").notNull(),
    /** EU WEEE collection category 1–6, for the mass-balance report. Optional on entry. */
    weeeCategory: smallint("weee_category").$type<WeeeCategory>(),
    /** Straight off the scale, in kg. */
    grossWeightKg: integer("gross_weight_kg").notNull(),
    /**
     * The tare actually applied to this pallet, in kg — snapshotted, never joined.
     *
     * For a standard packing the service fills it from `STANDARD_TARE_KG` and refuses a
     * client-supplied value; only `special` packing carries an individually weighed one.
     * Stored despite being derivable *today* because it must stay what it was: a signed
     * record's weights may not move if a standard tare is ever re-measured.
     */
    tareKg: integer("tare_kg").notNull(),
    /** Net weight is NOT a column — it is gross minus tare, derived at read time. */
    quantityPcs: integer("quantity_pcs"),
    /** Waste or reuse. Nullable while the delivery is a draft; required to sign it. */
    classification: wasteClassification("classification"),
    /** Irregularities — damage, a mismatch against the delivery note. */
    notice: text("notice"),
    /**
     * Who checked this pallet — the form's per-row "Worker" column, as an account
     * rather than a handwritten name. Defaults to the caller at the API layer.
     * `restrict` for the same reason as the delivery's signer: the accountability
     * trail must outlive personnel changes.
     */
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // No deletedAt: a pallet is not independently deletable once its delivery is
    // signed, and while it is a draft, removing a line means it never happened.
  },
  (table) => [
    // Also the index behind "the pallets of this delivery", so no separate one on
    // delivery_id alone.
    uniqueIndex("pallets_delivery_id_pallet_no_idx").on(table.deliveryId, table.palletNo),
  ],
);

export const palletsRelations = relations(pallets, ({ one }) => ({
  delivery: one(deliveries, { fields: [pallets.deliveryId], references: [deliveries.id] }),
  worker: one(users, { fields: [pallets.workerId], references: [users.id] }),
}));

export type Pallet = typeof pallets.$inferSelect;
export type NewPallet = typeof pallets.$inferInsert;
