import { Readable } from "node:stream";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";

import { fileBlobs } from "@repo/db";

import type { Database } from "../db/db.module";
import { DRIZZLE } from "../db/db.module";

/**
 * What the rest of the backend knows about file storage: bytes go in under a key,
 * come back as a stream, and can be removed. Narrow on purpose — services depend on
 * this interface, not on where the bytes actually live, so the backing can change
 * (today Postgres, someday an object store) without touching a feature module.
 */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Readable; contentLength: number }>;
  delete(key: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");

/**
 * File storage on the database — see `file_blobs` for why that is the right home
 * here: the deploy target (Vercel) has no filesystem that survives a request, and a
 * bucket service is infrastructure this install deliberately avoids. Everything is
 * private by construction — the only road to the bytes is an API route that checks
 * the caller's ability and streams; no URL to these rows exists.
 *
 * `put` overwrites, `get` of a missing key is a 404, `delete` of one is a no-op —
 * bucket semantics, so a future S3-backed implementation behaves identically.
 */
@Injectable()
export class StorageService implements ObjectStorage {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.db
      .insert(fileBlobs)
      .values({ key, content: body, contentType })
      .onConflictDoUpdate({
        target: fileBlobs.key,
        set: { content: sql`excluded.content`, contentType: sql`excluded.content_type` },
      });
  }

  async get(key: string): Promise<{ body: Readable; contentLength: number }> {
    const [row] = await this.db
      .select({ content: fileBlobs.content })
      .from(fileBlobs)
      .where(eq(fileBlobs.key, key))
      .limit(1);

    if (!row) throw new NotFoundException("File content not found in storage");

    // The driver answers bytea as a Buffer; normalized anyway so the promise holds
    // even if a driver change hands back a bare Uint8Array.
    const content = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
    return { body: Readable.from(content), contentLength: content.length };
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(fileBlobs).where(eq(fileBlobs.key, key));
  }
}
