import type { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { AppAbility } from "@repo/access";
import type { Delivery } from "@repo/db";
import { asSubject } from "@repo/access";
import { deliveries, files, pallets, users } from "@repo/db";
import { isUploadMimeType, MAX_UPLOAD_BYTES } from "@repo/goods-in";

import type { BaseResponse } from "../../lib/base.dto";
import type { Database } from "../../lib/db/db.module";
import type { ObjectStorage } from "../../lib/storage/storage.service";
import type { UploadFileDto } from "./dto/upload-file.dto";
import type { DeliveryFileEntity } from "./entities/file.entity";
import type { FileRow } from "./file-rows";
import { assertFieldsAllowed } from "../../lib/ability/field-access";
import { DRIZZLE } from "../../lib/db/db.module";
import { OBJECT_STORAGE } from "../../lib/storage/storage.service";
import { fileSelection, toFileEntity } from "./file-rows";

/** The file part of a multipart request, as multer's memory storage hands it over. */
export interface UploadedUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Longer is a paste accident, not a filename; the stored original is capped here. */
const FILE_NAME_MAX = 255;

/**
 * The files attached to a delivery — pallet photos and document scans.
 *
 * Everything here rides the delivery's authorization the way pallet rows do: writes
 * are `update Delivery` narrowed to the `files` field, reads are `read Delivery`, and
 * a signed delivery accepts no file changes at all — the attachments are part of the
 * record being kept unaltered. Downloads stream through this API after those checks;
 * the bucket itself is never exposed.
 */
@Injectable()
export class DeliveryFilesService {
  private readonly logger = new Logger(DeliveryFilesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async upload(
    deliveryId: string,
    dto: UploadFileDto,
    upload: UploadedUpload | undefined,
    ability: AppAbility,
    uploaderId: string,
  ): Promise<BaseResponse<DeliveryFileEntity>> {
    const delivery = await this.requireDelivery(deliveryId);
    this.assertDraft(delivery);
    this.assertCanWriteFiles(ability, delivery);

    if (!upload) throw new BadRequestException("file is required — send it as the `file` part");
    if (!isUploadMimeType(upload.mimetype)) {
      throw new BadRequestException(
        "Only JPEG, PNG, WebP and PDF files can be attached to a delivery",
      );
    }
    // Multer's limit already refuses larger bodies; this covers a differently-built caller.
    if (upload.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException("The file is too large");
    }

    // Exactly one purpose: a photo of one pallet, or a scan of one document type.
    if ((dto.palletId === undefined) === (dto.docType === undefined)) {
      throw new BadRequestException(
        "Send exactly one of palletId (a pallet photo) or docType (a document scan)",
      );
    }
    if (dto.palletId) await this.assertPallet(deliveryId, dto.palletId);

    const id = randomUUID();
    // Opaque on purpose — grouping for bucket hygiene, no metadata hiding in the key.
    const storageKey = `deliveries/${deliveryId}/${id}`;

    await this.storage.put(storageKey, upload.buffer, upload.mimetype);

    try {
      await this.db.insert(files).values({
        id,
        storageKey,
        fileName: upload.originalname.slice(0, FILE_NAME_MAX),
        mimeType: upload.mimetype,
        sizeBytes: upload.size,
        deliveryId,
        palletId: dto.palletId ?? null,
        docType: dto.docType ?? null,
        uploadedById: uploaderId,
      });
    } catch (error) {
      // The object went in before the row; a failed insert must not strand it.
      await this.discardObject(storageKey);
      throw error;
    }

    return { data: toFileEntity(await this.requireFileRow(deliveryId, id), delivery) };
  }

  /**
   * The bytes, streamed — the only road to a stored file. 404 rather than 403 when the
   * caller's conditions exclude the delivery, for the same reason as every findOne.
   */
  async download(
    deliveryId: string,
    fileId: string,
    ability: AppAbility,
  ): Promise<{ body: Readable; entity: DeliveryFileEntity }> {
    const delivery = await this.requireDelivery(deliveryId);
    if (!ability.can("read", asSubject("Delivery", delivery))) {
      throw new NotFoundException("Delivery not found");
    }

    const row = await this.requireFileRow(deliveryId, fileId);
    const { body } = await this.storage.get(row.storageKey);

    return { body, entity: toFileEntity(row, delivery) };
  }

  /** Removing an attachment is editing the draft; a signed record keeps its evidence. */
  async remove(deliveryId: string, fileId: string, ability: AppAbility): Promise<void> {
    const delivery = await this.requireDelivery(deliveryId);
    this.assertDraft(delivery);
    this.assertCanWriteFiles(ability, delivery);

    const [deleted] = await this.db
      .delete(files)
      .where(and(eq(files.id, fileId), eq(files.deliveryId, deliveryId)))
      .returning({ storageKey: files.storageKey });

    if (!deleted) throw new NotFoundException("File not found");

    // The row is the record; the object is bytes. Failing to collect the bytes leaves
    // a harmless orphan in a private bucket, so it is logged rather than surfaced.
    await this.discardObject(deleted.storageKey);
  }

  private async requireDelivery(id: string): Promise<Delivery> {
    const [row] = await this.db
      .select()
      .from(deliveries)
      .where(and(eq(deliveries.id, id), isNull(deliveries.deletedAt)))
      .limit(1);

    if (!row) throw new NotFoundException("Delivery not found");
    return row;
  }

  private async requireFileRow(deliveryId: string, fileId: string): Promise<FileRow> {
    const [row] = await this.db
      .select(fileSelection())
      .from(files)
      .leftJoin(pallets, eq(pallets.id, files.palletId))
      .innerJoin(users, eq(users.id, files.uploadedById))
      .where(and(eq(files.id, fileId), eq(files.deliveryId, deliveryId)))
      .limit(1);

    if (!row) throw new NotFoundException("File not found");
    return row;
  }

  private async assertPallet(deliveryId: string, palletId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: pallets.id })
      .from(pallets)
      .where(and(eq(pallets.id, palletId), eq(pallets.deliveryId, deliveryId)))
      .limit(1);

    if (!row) throw new BadRequestException("palletId is not a pallet of this delivery");
  }

  private assertDraft(row: Delivery): void {
    if (row.status !== "draft") {
      throw new ConflictException(
        "A signed delivery is immutable — its photos and scans are part of the record",
      );
    }
  }

  /** File writes are the `files` field of the delivery, the way pallet rows are `pallets`. */
  private assertCanWriteFiles(ability: AppAbility, row: Delivery): void {
    const subject = asSubject("Delivery", row);
    if (!ability.can("update", subject)) {
      throw new ForbiddenException("Insufficient permissions for this delivery");
    }
    assertFieldsAllowed(ability, subject, ["files"]);
  }

  private async discardObject(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      this.logger.warn(
        `could not remove object "${storageKey}" from storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
