import { Exclude, Expose, Type } from "class-transformer";

import type { GoodsDocType } from "@repo/goods-in";

/** The account that added a file to the record. */
@Exclude()
export class FileUploaderEntity {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() name: string | null;
}

/**
 * Serialization allowlist for an attached file — a pallet photo or a document scan.
 *
 * `storageKey` is deliberately absent: where the bytes live is the storage layer's
 * business, and the only way to them is `GET /deliveries/:id/files/:fileId`, which
 * re-checks the caller's ability and streams. No public URL exists to leak.
 */
@Exclude()
export class DeliveryFileEntity {
  @Expose() id: string;
  @Expose() deliveryId: string;
  /** Set on a pallet photo; exactly one of this and `docType` is set. */
  @Expose() palletId: string | null;
  /** `P01` for a pallet photo, null for a scan. Derived. */
  @Expose() palletLabel: string | null;
  /** Set on a document scan — which of the accompanying papers this is. */
  @Expose() docType: GoodsDocType | null;
  /** The name the file arrived under, kept for the record. */
  @Expose() fileName: string;
  @Expose() mimeType: string;
  @Expose() sizeBytes: number;
  /**
   * The friendly name a download carries — `GI-0091_P01_20260713.jpg`. The paper
   * form's naming convention, honored as a rendering instead of stored anywhere.
   */
  @Expose() downloadName: string;

  @Expose()
  @Type(() => FileUploaderEntity)
  uploadedBy: FileUploaderEntity;

  @Expose() uploadedById: string;
  @Expose() createdAt: Date;
}
