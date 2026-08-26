import { customType, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Drizzle has no first-class bytea; this is the documented way to declare one. */
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * The bytes behind `files` rows — Postgres standing in for an object store.
 *
 * Deliberately in the database rather than on disk or in a bucket: the backend deploys
 * to Vercel, whose filesystem is ephemeral (a file "saved to a folder" is gone when the
 * function recycles), and a separate storage service is infrastructure this install
 * does not want. The database is already there, already durable, and already backed up
 * together with the records these files are evidence for — which is exactly what a
 * ten-year retention rule wants. Photos are downscaled by the console before upload,
 * so the volume stays in single-digit gigabytes for years of deliveries.
 *
 * Deliberately a *separate* table from `files`: metadata queries select
 * `getTableColumns(files)`, and a bytea column there would drag megabytes into every
 * delivery detail render. Postgres TOASTs the bytes out of line; nothing reads them
 * but the storage service, one row at a time.
 *
 * No foreign key to `files` on purpose — this table is a bucket, keyed by the opaque
 * `storage_key`, and the storage layer knows nothing about what the keys mean. The
 * service layer owns the pairing, exactly as it would with S3; swapping this table for
 * a real object store later touches only `StorageService`.
 */
export const fileBlobs = pgTable("file_blobs", {
  key: text("key").primaryKey(),
  contentType: text("content_type").notNull(),
  content: bytea("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FileBlob = typeof fileBlobs.$inferSelect;
export type NewFileBlob = typeof fileBlobs.$inferInsert;
