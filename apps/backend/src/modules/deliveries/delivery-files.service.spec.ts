import type { Readable } from "node:stream";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ability, connect, createSupplier, createUser, resetDb } from "@test/harness";
import { count } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fileBlobs } from "@repo/db";

import type { UploadedUpload } from "./delivery-files.service";
import type { CreateDeliveryDto } from "./dto/create-delivery.dto";
import type { CreatePalletDto } from "./dto/create-pallet.dto";
import type { UpdatePalletDto } from "./dto/update-pallet.dto";
import type { UploadFileDto } from "./dto/upload-file.dto";
import { StorageService } from "../../lib/storage/storage.service";
import { DeliveriesService } from "./deliveries.service";
import { DeliveryFilesService } from "./delivery-files.service";

const { db, end } = connect();
const storage = new StorageService(db);
const deliveriesService = new DeliveriesService(db, storage);
const service = new DeliveryFilesService(db, storage);

afterAll(() => end());

const admin = () => ability({ action: "manage", subject: "all" });

const header = (supplierId: string) =>
  ({ supplierId, deliveredOn: "2026-08-13" }) as CreateDeliveryDto;

const palletDraft = (fields: Partial<CreatePalletDto> = {}) =>
  ({
    packing: "eur",
    material: "Small appliances",
    grossWeightKg: 223,
    ...fields,
  }) as CreatePalletDto;

const asPhoto = (palletId: string) => ({ palletId }) as UploadFileDto;
const asScan = (docType: UploadFileDto["docType"]) => ({ docType }) as UploadFileDto;

const upload = (
  originalname: string,
  mimetype = "image/jpeg",
  buffer = Buffer.from(`bytes of ${originalname}`),
): UploadedUpload => ({ originalname, mimetype, size: buffer.length, buffer });

async function drain(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe("delivery files — photos, scans, and the private road to them", () => {
  let workerId: string;
  let deliveryId: string;
  let palletId: string;

  beforeEach(async () => {
    await resetDb(db);
    workerId = (await createUser(db)).id;
    const supplier = await createSupplier(db);
    deliveryId = (await deliveriesService.create(header(supplier.id))).data.id;
    palletId = (await deliveriesService.addPallet(deliveryId, palletDraft(), admin(), workerId))
      .data.id;
  });

  it("stores a pallet photo and streams it back byte for byte", async () => {
    const sent = upload("IMG_0042.jpg");
    const stored = await service.upload(deliveryId, asPhoto(palletId), sent, admin(), workerId);

    // The download name is the paper form's convention, derived — never stored.
    expect(stored.data).toMatchObject({
      palletId,
      palletLabel: "P01",
      docType: null,
      fileName: "IMG_0042.jpg",
      downloadName: "GI-0001_P01_20260813.jpg",
      sizeBytes: sent.size,
    });
    expect(stored.data.uploadedBy.id).toBe(workerId);

    const fetched = await service.download(deliveryId, stored.data.id, admin());
    expect(await drain(fetched.body)).toEqual(sent.buffer);
    expect(fetched.entity.mimeType).toBe("image/jpeg");
  });

  it("stores a document scan under its document's name", async () => {
    const stored = await service.upload(
      deliveryId,
      asScan("cmr"),
      upload("scan001.pdf", "application/pdf"),
      admin(),
      workerId,
    );

    expect(stored.data).toMatchObject({
      palletId: null,
      palletLabel: null,
      docType: "cmr",
      downloadName: "GI-0001_CMR.pdf",
    });
  });

  it("a file is a photo or a scan — exactly one, never both, never neither", async () => {
    await expect(
      service.upload(deliveryId, {} as UploadFileDto, upload("x.jpg"), admin(), workerId),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.upload(
        deliveryId,
        { palletId, docType: "cmr" } as UploadFileDto,
        upload("x.jpg"),
        admin(),
        workerId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("refuses a pallet from another delivery, a foreign mime, and a missing file", async () => {
    const otherSupplier = await createSupplier(db);
    const other = await deliveriesService.create(header(otherSupplier.id));
    const foreignPallet = (
      await deliveriesService.addPallet(other.data.id, palletDraft(), admin(), workerId)
    ).data.id;

    await expect(
      service.upload(deliveryId, asPhoto(foreignPallet), upload("x.jpg"), admin(), workerId),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.upload(
        deliveryId,
        asScan("cmr"),
        upload("evil.svg", "image/svg+xml"),
        admin(),
        workerId,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.upload(deliveryId, asScan("cmr"), undefined, admin(), workerId),
    ).rejects.toThrow(BadRequestException);
  });

  it("the delivery detail embeds the file records", async () => {
    await service.upload(deliveryId, asPhoto(palletId), upload("a.jpg"), admin(), workerId);
    await service.upload(
      deliveryId,
      asScan("weight_certificate"),
      upload("b.pdf", "application/pdf"),
      admin(),
      workerId,
    );

    const detail = await deliveriesService.findOne(deliveryId, admin());
    expect(detail.data.files).toHaveLength(2);
    expect(detail.data.files.map((file) => file.downloadName)).toEqual([
      "GI-0001_P01_20260813.jpg",
      "GI-0001_WEIGHT-CERTIFICATE.pdf",
    ]);
  });

  it("deleting a file removes the record and the bytes", async () => {
    const stored = await service.upload(
      deliveryId,
      asPhoto(palletId),
      upload("a.jpg"),
      admin(),
      workerId,
    );

    await service.remove(deliveryId, stored.data.id, admin());

    await expect(service.download(deliveryId, stored.data.id, admin())).rejects.toThrow(
      NotFoundException,
    );
    const [blobs] = await db.select({ total: count() }).from(fileBlobs);
    expect(blobs?.total).toBe(0);
  });

  it("removing a pallet sweeps its photos, rows and bytes both", async () => {
    await service.upload(deliveryId, asPhoto(palletId), upload("a.jpg"), admin(), workerId);
    await service.upload(deliveryId, asPhoto(palletId), upload("b.jpg"), admin(), workerId);

    await deliveriesService.removePallet(deliveryId, palletId, admin());

    const detail = await deliveriesService.findOne(deliveryId, admin());
    expect(detail.data.files).toEqual([]);
    const [blobs] = await db.select({ total: count() }).from(fileBlobs);
    expect(blobs?.total).toBe(0);
  });

  it("a signed delivery keeps its files frozen — still readable, never changeable", async () => {
    const stored = await service.upload(
      deliveryId,
      asPhoto(palletId),
      upload("a.jpg"),
      admin(),
      workerId,
    );
    await deliveriesService.updatePallet(
      deliveryId,
      palletId,
      { classification: "waste" } as UpdatePalletDto,
      admin(),
    );
    await deliveriesService.sign(deliveryId, admin(), workerId);

    await expect(
      service.upload(deliveryId, asScan("cmr"), upload("late.pdf", "application/pdf"), admin(), workerId),
    ).rejects.toThrow(ConflictException);
    await expect(service.remove(deliveryId, stored.data.id, admin())).rejects.toThrow(
      ConflictException,
    );

    const fetched = await service.download(deliveryId, stored.data.id, admin());
    expect((await drain(fetched.body)).length).toBeGreaterThan(0);
  });

  it("file writes are the `files` field of the delivery", async () => {
    const palletsOnly = ability({ action: "update", subject: "Delivery", fields: ["pallets"] });
    await expect(
      service.upload(deliveryId, asPhoto(palletId), upload("a.jpg"), palletsOnly, workerId),
    ).rejects.toThrow(/files/);

    const filesOnly = ability({ action: "update", subject: "Delivery", fields: ["files"] });
    await expect(
      service.upload(deliveryId, asPhoto(palletId), upload("a.jpg"), filesOnly, workerId),
    ).resolves.toMatchObject({ data: { palletLabel: "P01" } });
  });

  it("downloads follow read conditions with a 404, uploads follow update with a 403", async () => {
    const stored = await service.upload(
      deliveryId,
      asPhoto(palletId),
      upload("a.jpg"),
      admin(),
      workerId,
    );

    const elsewhere = "00000000-0000-0000-0000-000000000000";
    const blindReader = ability({
      action: "read",
      subject: "Delivery",
      conditions: { supplierId: elsewhere },
    });
    await expect(service.download(deliveryId, stored.data.id, blindReader)).rejects.toThrow(
      NotFoundException,
    );

    const foreignUpdater = ability({
      action: "update",
      subject: "Delivery",
      conditions: { supplierId: elsewhere },
    });
    await expect(
      service.upload(deliveryId, asScan("cmr"), upload("x.pdf", "application/pdf"), foreignUpdater, workerId),
    ).rejects.toThrow(ForbiddenException);
  });
});
