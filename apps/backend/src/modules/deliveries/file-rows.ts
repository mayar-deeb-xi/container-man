import { getTableColumns } from "drizzle-orm";

import type { StoredFile } from "@repo/db";
import { files, pallets, users } from "@repo/db";
import {
  formatPalletLabel,
  formatPhotoDownloadName,
  formatScanDownloadName,
  isUploadMimeType,
} from "@repo/goods-in";

import type { DeliveryFileEntity } from "./entities/file.entity";

/** A file row joined with its pallet's number (photos) and its uploader. */
export interface FileRow extends StoredFile {
  palletNo: number | null;
  uploaderEmail: string;
  uploaderName: string | null;
}

/**
 * The columns every file read selects. Shared between the files service and the
 * delivery detail (which embeds the file list) so the two cannot drift; the caller
 * provides the joins: `leftJoin(pallets)` on `palletId`, `innerJoin(users)` on
 * `uploadedById`.
 */
export function fileSelection() {
  return {
    ...getTableColumns(files),
    palletNo: pallets.palletNo,
    uploaderEmail: users.email,
    uploaderName: users.name,
  };
}

/** What a download name needs to know about the delivery the file belongs to. */
export interface FileNamingContext {
  deliveryNo: number;
  deliveredOn: string;
}

/**
 * Folds a joined row into the entity shape — dropping `storageKey` on the way, and
 * deriving the friendly download name from the record rather than from anything
 * stored: a photo is named for its delivery, pallet and date, a scan for its
 * delivery and document type.
 */
export function toFileEntity(row: FileRow, delivery: FileNamingContext): DeliveryFileEntity {
  const { palletNo, uploaderEmail, uploaderName, storageKey: _key, ...file } = row;

  const mime = isUploadMimeType(file.mimeType) ? file.mimeType : undefined;
  const downloadName =
    file.palletId !== null && palletNo !== null && mime
      ? formatPhotoDownloadName(delivery.deliveryNo, palletNo, delivery.deliveredOn, mime)
      : file.docType !== null && mime
        ? formatScanDownloadName(delivery.deliveryNo, file.docType, mime)
        : file.fileName;

  return {
    ...file,
    palletLabel: palletNo !== null ? formatPalletLabel(palletNo) : null,
    downloadName,
    uploadedBy: { id: file.uploadedById, email: uploaderEmail, name: uploaderName },
  };
}
