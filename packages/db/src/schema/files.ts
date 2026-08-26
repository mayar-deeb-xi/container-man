import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { deliveries, goodsDocType } from "./deliveries";
import { pallets } from "./pallets";
import { users } from "./users";

/**
 * A stored file — the evidence attached to a goods-in record: a pallet photo or a scan
 * of one of the accompanying papers.
 *
 * The bytes live in object storage under `storageKey` and are only ever served through
 * the API, which re-checks the caller's ability per request — no bucket URL is public
 * and none is handed out. The row is the source of truth about what the object *is*;
 * the paper form solved that with a filename convention, which here exists only as a
 * rendering when someone downloads (`GI-0091_P01_20260713.jpg`).
 *
 * A file is immutable: there is no update, and no `updatedAt` to pretend otherwise.
 * Replacing one is a delete plus a new upload, and both are refused once the delivery
 * is signed — the photos and scans are part of the record GoBD keeps unaltered.
 */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Where the bytes sit in the bucket — `deliveries/<deliveryId>/<fileId>`. Opaque
     * by design: nothing downstream parses it, and no metadata hides in it.
     */
    storageKey: text("storage_key").notNull(),
    /** The name the file arrived under, kept for the record; downloads get a generated one. */
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /**
     * Cascade is safe *because* deliveries are never hard-deleted through the API —
     * it exists so a manual purge of a delivery cannot strand rows. The objects in the
     * bucket are the service layer's to clean up.
     */
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    /** Set on a pallet photo. Cascade: a line struck from a draft takes its photos with it. */
    palletId: uuid("pallet_id").references(() => pallets.id, { onDelete: "cascade" }),
    /** Set on a scanned accompanying paper — which of the form's documents this is. */
    docType: goodsDocType("doc_type"),
    /** Who put it in the record — same accountability rule as the pallet's worker. */
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("files_storage_key_idx").on(table.storageKey),
    // "The files of this delivery" — the detail view's query.
    index("files_delivery_id_idx").on(table.deliveryId),
    index("files_pallet_id_idx").on(table.palletId),
    /**
     * A file is a pallet photo or a document scan, never both — the service enforces
     * "exactly one", and this keeps "both" impossible even for a hand-written INSERT.
     */
    check("files_one_purpose", sql`${table.palletId} is null or ${table.docType} is null`),
  ],
);

export const filesRelations = relations(files, ({ one }) => ({
  delivery: one(deliveries, { fields: [files.deliveryId], references: [deliveries.id] }),
  pallet: one(pallets, { fields: [files.palletId], references: [pallets.id] }),
  uploadedBy: one(users, { fields: [files.uploadedById], references: [users.id] }),
}));

export type StoredFile = typeof files.$inferSelect;
export type NewStoredFile = typeof files.$inferInsert;
