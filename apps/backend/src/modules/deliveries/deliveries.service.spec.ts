import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ability, connect, createDelivery, createSupplier, createUser, resetDb } from "@test/harness";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { suppliers } from "@repo/db";

import type { CreateDeliveryDto } from "./dto/create-delivery.dto";
import type { CreatePalletDto } from "./dto/create-pallet.dto";
import type { UpdateDeliveryDto } from "./dto/update-delivery.dto";
import type { UpdatePalletDto } from "./dto/update-pallet.dto";
import { StorageService } from "../../lib/storage/storage.service";
import { DeliveriesService } from "./deliveries.service";

const { db, end } = connect();
const service = new DeliveriesService(db, new StorageService(db));

afterAll(() => end());

const LIST_DEFAULTS = { skip: 0, take: 20 };

/** The service is called the way the controller calls it — DTO shapes, post-transform. */
const patch = (fields: Partial<UpdateDeliveryDto>) => fields as UpdateDeliveryDto;
const palletPatch = (fields: Partial<UpdatePalletDto>) => fields as UpdatePalletDto;

const header = (supplierId: string, fields: Partial<CreateDeliveryDto> = {}) =>
  ({ supplierId, deliveredOn: "2026-08-13", ...fields }) as CreateDeliveryDto;

/** A euro pallet of 223 kg gross: standard tare 23, net 200. */
const palletDraft = (fields: Partial<CreatePalletDto> = {}) =>
  ({
    packing: "eur",
    material: "Small appliances",
    grossWeightKg: 223,
    ...fields,
  }) as CreatePalletDto;

const admin = () => ability({ action: "manage", subject: "all" });

describe("deliveries — record keeping", () => {
  let supplierId: string;

  beforeEach(async () => {
    await resetDb(db);
    supplierId = (await createSupplier(db, { code: "S014" })).id;
  });

  it("creates a draft register entry — reference derived, supplier as code only", async () => {
    const created = await service.create(header(supplierId, { lotNo: "LOT-A" }));

    expect(created.data).toMatchObject({
      deliveryNo: 1,
      reference: "GI-0001",
      status: "draft",
      lotNo: "LOT-A",
      documents: [],
      palletCount: 0,
      totalNetWeightKg: 0,
      signedBy: null,
    });
    // The whole shape, deliberately: the supplier's *name* must not ride along —
    // goods-in shows codes, and names live behind `read Supplier`.
    expect(created.data.supplier).toEqual({ id: supplierId, code: "S014" });
  });

  it("numbers deliveries sequentially and never reuses a trashed number", async () => {
    const first = await service.create(header(supplierId));
    const second = await service.create(header(supplierId));
    expect([first.data.reference, second.data.reference]).toEqual(["GI-0001", "GI-0002"]);

    await service.softDelete(second.data.id, admin());
    const third = await service.create(header(supplierId));
    expect(third.data.reference).toBe("GI-0003");
  });

  it("refuses a supplier that does not exist or is deleted", async () => {
    await expect(
      service.create(header("00000000-0000-0000-0000-000000000000")),
    ).rejects.toThrow(BadRequestException);

    const gone = await createSupplier(db, { deletedAt: new Date() });
    await expect(service.create(header(gone.id))).rejects.toThrow(BadRequestException);
  });

  it("edits the draft header, and null clears the document checklist", async () => {
    const created = await service.create(header(supplierId, { documents: ["cmr"] }));

    const updated = await service.update(
      created.data.id,
      patch({ lotNo: "LOT-7", documents: null }),
      admin(),
    );
    expect(updated.data.lotNo).toBe("LOT-7");
    expect(updated.data.documents).toEqual([]);

    const other = await createSupplier(db, { code: "S099" });
    const moved = await service.update(created.data.id, patch({ supplierId: other.id }), admin());
    expect(moved.data.supplier).toEqual({ id: other.id, code: "S099" });
  });

  it("writes nothing for an empty patch", async () => {
    const created = await service.create(header(supplierId));
    const after = await service.update(created.data.id, patch({}), admin());
    expect(after.data.updatedAt).toEqual(created.data.updatedAt);
  });
});

describe("deliveries — the register list", () => {
  let workerId: string;
  let supplierA: string;
  let supplierB: string;

  beforeEach(async () => {
    await resetDb(db);
    workerId = (await createUser(db)).id;
    supplierA = (await createSupplier(db, { code: "S100" })).id;
    supplierB = (await createSupplier(db, { code: "S200" })).id;
  });

  it("lists newest first with pallet aggregates", async () => {
    const first = await service.create(header(supplierA));
    const second = await service.create(header(supplierB));

    await service.addPallet(first.data.id, palletDraft({ grossWeightKg: 123 }), admin(), workerId);
    await service.addPallet(
      first.data.id,
      palletDraft({ packing: "gitterbox", grossWeightKg: 185 }),
      admin(),
      workerId,
    );

    const result = await service.list(LIST_DEFAULTS as never, admin());
    expect(result.data.map((row) => row.id)).toEqual([second.data.id, first.data.id]);

    const aggregated = result.data.find((row) => row.id === first.data.id);
    expect(aggregated).toMatchObject({ palletCount: 2, totalNetWeightKg: 100 + 100 });
    expect(result.pagination?.total).toBe(2);
  });

  it("filters by status, supplier and date range", async () => {
    const draft = await service.create(header(supplierA, { deliveredOn: "2026-08-01" }));
    const signed = await createDelivery(db, {
      supplierId: supplierA,
      deliveredOn: "2026-08-10",
      status: "signed",
    });
    const foreign = await service.create(header(supplierB, { deliveredOn: "2026-08-20" }));

    const drafts = await service.list({ ...LIST_DEFAULTS, status: "draft" } as never, admin());
    expect(new Set(drafts.data.map((row) => row.id))).toEqual(
      new Set([draft.data.id, foreign.data.id]),
    );

    const signedOnly = await service.list({ ...LIST_DEFAULTS, status: "signed" } as never, admin());
    expect(signedOnly.data.map((row) => row.id)).toEqual([signed.id]);

    const bySupplier = await service.list(
      { ...LIST_DEFAULTS, supplierId: supplierB } as never,
      admin(),
    );
    expect(bySupplier.data.map((row) => row.id)).toEqual([foreign.data.id]);

    const midAugust = await service.list(
      { ...LIST_DEFAULTS, deliveredFrom: "2026-08-05", deliveredTo: "2026-08-15" } as never,
      admin(),
    );
    expect(midAugust.data.map((row) => row.id)).toEqual([signed.id]);
  });

  it("supplier options carry codes only — never names — and skip deleted suppliers", async () => {
    await createSupplier(db, { code: "S300", deletedAt: new Date() });

    const options = await service.supplierOptions();
    expect(options.data.map((row) => row.code)).toEqual(["S100", "S200"]);
    for (const row of options.data) {
      expect(Object.keys(row).sort()).toEqual(["code", "id"]);
    }
  });

  it("search finds a reference, a bare number, a lot and a supplier code", async () => {
    await service.create(header(supplierA, { lotNo: "LOT-A" }));
    const wanted = await service.create(header(supplierB, { lotNo: "CHARGE-B" }));

    for (const term of ["GI-0002", "2", "charge", "s2"]) {
      const result = await service.list({ ...LIST_DEFAULTS, search: term } as never, admin());
      expect(result.data.map((row) => row.id), `search: ${term}`).toEqual([wanted.data.id]);
    }
  });

  it("a conditional read rule scopes list and detail, and the canary stays silent", async () => {
    const own = await service.create(header(supplierA));
    const foreign = await service.create(header(supplierB));

    const logger = vi.spyOn(
      (service as unknown as { logger: { error: (message: string) => void } }).logger,
      "error",
    );

    const scoped = ability({
      action: "read",
      subject: "Delivery",
      conditions: { supplierId: supplierA },
    });

    const result = await service.list(LIST_DEFAULTS as never, scoped);
    expect(result.data.map((row) => row.id)).toEqual([own.data.id]);
    expect(result.pagination?.total).toBe(1);
    expect(logger).not.toHaveBeenCalled();
    logger.mockRestore();

    await expect(service.findOne(foreign.data.id, scoped)).rejects.toThrow(NotFoundException);
  });
});

describe("pallets — the form's rows", () => {
  let workerId: string;
  let deliveryId: string;

  beforeEach(async () => {
    await resetDb(db);
    workerId = (await createUser(db)).id;
    const supplier = await createSupplier(db);
    deliveryId = (await service.create(header(supplier.id))).data.id;
  });

  it("numbers sequentially, applies the standard tare and derives the net", async () => {
    const first = await service.addPallet(deliveryId, palletDraft(), admin(), workerId);
    expect(first.data).toMatchObject({
      palletNo: 1,
      palletLabel: "P01",
      tareKg: 23,
      netWeightKg: 200,
    });
    expect(first.data.worker.id).toBe(workerId);

    const second = await service.addPallet(
      deliveryId,
      palletDraft({ packing: "gitterbox", grossWeightKg: 185 }),
      admin(),
      workerId,
    );
    expect(second.data).toMatchObject({ palletLabel: "P02", tareKg: 85, netWeightKg: 100 });
  });

  it("refuses a client-supplied tare on standard packing", async () => {
    await expect(
      service.addPallet(deliveryId, palletDraft({ tareKg: 20 }), admin(), workerId),
    ).rejects.toThrow(/standard tare/);
  });

  it("special packing requires its weighed tare — zero included", async () => {
    await expect(
      service.addPallet(deliveryId, palletDraft({ packing: "special" }), admin(), workerId),
    ).rejects.toThrow(BadRequestException);

    const loose = await service.addPallet(
      deliveryId,
      palletDraft({ packing: "special", tareKg: 0, grossWeightKg: 50 }),
      admin(),
      workerId,
    );
    expect(loose.data).toMatchObject({ tareKg: 0, netWeightKg: 50 });
  });

  it("refuses a gross at or below the tare", async () => {
    await expect(
      service.addPallet(deliveryId, palletDraft({ grossWeightKg: 23 }), admin(), workerId),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.addPallet(
        deliveryId,
        palletDraft({ packing: "special", tareKg: 100, grossWeightKg: 100 }),
        admin(),
        workerId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("the worker defaults to the caller, and an explicit worker must be live", async () => {
    const colleague = await createUser(db);
    const recorded = await service.addPallet(
      deliveryId,
      palletDraft({ workerId: colleague.id }),
      admin(),
      workerId,
    );
    expect(recorded.data.worker).toMatchObject({ id: colleague.id, email: colleague.email });

    const gone = await createUser(db, { deletedAt: new Date() });
    await expect(
      service.addPallet(deliveryId, palletDraft({ workerId: gone.id }), admin(), workerId),
    ).rejects.toThrow(BadRequestException);
  });

  it("packing changes re-resolve the tare in both directions", async () => {
    const pallet = await service.addPallet(deliveryId, palletDraft(), admin(), workerId);
    const id = pallet.data.id;

    const boxed = await service.updatePallet(
      deliveryId,
      id,
      palletPatch({ packing: "gitterbox" }),
      admin(),
    );
    expect(boxed.data).toMatchObject({ tareKg: 85, netWeightKg: 223 - 85 });

    await expect(
      service.updatePallet(deliveryId, id, palletPatch({ packing: "special" }), admin()),
    ).rejects.toThrow(/tareKg/);

    const weighed = await service.updatePallet(
      deliveryId,
      id,
      palletPatch({ packing: "special", tareKg: 40 }),
      admin(),
    );
    expect(weighed.data).toMatchObject({ tareKg: 40, netWeightKg: 183 });

    const standard = await service.updatePallet(
      deliveryId,
      id,
      palletPatch({ packing: "eur" }),
      admin(),
    );
    expect(standard.data.tareKg).toBe(23);

    await expect(
      service.updatePallet(deliveryId, id, palletPatch({ tareKg: 5 }), admin()),
    ).rejects.toThrow(/standard tare/);
  });

  it("update validates the weights against the row as it will be", async () => {
    const pallet = await service.addPallet(deliveryId, palletDraft(), admin(), workerId);

    await expect(
      service.updatePallet(deliveryId, pallet.data.id, palletPatch({ grossWeightKg: 20 }), admin()),
    ).rejects.toThrow(BadRequestException);
  });

  it("writes nothing for an empty pallet patch", async () => {
    const pallet = await service.addPallet(deliveryId, palletDraft(), admin(), workerId);
    const after = await service.updatePallet(deliveryId, pallet.data.id, palletPatch({}), admin());
    expect(after.data.updatedAt).toEqual(pallet.data.updatedAt);
  });

  it("a middle removal never renumbers — the next line continues from the top", async () => {
    await service.addPallet(deliveryId, palletDraft(), admin(), workerId);
    const second = await service.addPallet(deliveryId, palletDraft(), admin(), workerId);
    await service.addPallet(deliveryId, palletDraft(), admin(), workerId);

    await service.removePallet(deliveryId, second.data.id, admin());
    await service.addPallet(deliveryId, palletDraft(), admin(), workerId);

    const detail = await service.findOne(deliveryId, admin());
    expect(detail.data.pallets.map((row) => row.palletLabel)).toEqual(["P01", "P03", "P04"]);
  });

  it("a pallet is only reachable through its own delivery", async () => {
    const pallet = await service.addPallet(deliveryId, palletDraft(), admin(), workerId);
    const otherSupplier = await createSupplier(db);
    const other = await service.create(header(otherSupplier.id));

    await expect(
      service.updatePallet(other.data.id, pallet.data.id, palletPatch({ material: "x" }), admin()),
    ).rejects.toThrow(NotFoundException);
    await expect(service.removePallet(other.data.id, pallet.data.id, admin())).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe("deliveries — sign-off and immutability", () => {
  let workerId: string;
  let supplierId: string;
  let deliveryId: string;

  beforeEach(async () => {
    await resetDb(db);
    workerId = (await createUser(db)).id;
    supplierId = (await createSupplier(db, { code: "S014" })).id;
    deliveryId = (await service.create(header(supplierId))).data.id;
  });

  it("refuses to sign an empty record", async () => {
    await expect(service.sign(deliveryId, admin(), workerId)).rejects.toThrow(/no pallets/);
  });

  it("refuses to sign while a pallet lacks its classification, naming it", async () => {
    await service.addPallet(
      deliveryId,
      palletDraft({ classification: "waste" }),
      admin(),
      workerId,
    );
    await service.addPallet(deliveryId, palletDraft(), admin(), workerId);

    const attempt = service.sign(deliveryId, admin(), workerId);
    await expect(attempt).rejects.toThrow(BadRequestException);
    await expect(service.sign(deliveryId, admin(), workerId)).rejects.toThrow(/P02/);
  });

  it("signs once: status, signer, timestamp — and never twice", async () => {
    await service.addPallet(
      deliveryId,
      palletDraft({ classification: "waste" }),
      admin(),
      workerId,
    );
    await service.addPallet(
      deliveryId,
      palletDraft({ classification: "reuse", packing: "gitterbox", grossWeightKg: 185 }),
      admin(),
      workerId,
    );

    const signed = await service.sign(deliveryId, admin(), workerId);
    expect(signed.data.status).toBe("signed");
    expect(signed.data.signedBy?.id).toBe(workerId);
    expect(signed.data.signedAt).toBeInstanceOf(Date);
    expect(signed.data.pallets).toHaveLength(2);

    await expect(service.sign(deliveryId, admin(), workerId)).rejects.toThrow(ConflictException);
  });

  it("a signed record refuses every write, deletion included", async () => {
    const pallet = await service.addPallet(
      deliveryId,
      palletDraft({ classification: "waste" }),
      admin(),
      workerId,
    );
    await service.sign(deliveryId, admin(), workerId);

    await expect(
      service.update(deliveryId, patch({ lotNo: "LOT-X" }), admin()),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.addPallet(deliveryId, palletDraft(), admin(), workerId),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.updatePallet(deliveryId, pallet.data.id, palletPatch({ material: "x" }), admin()),
    ).rejects.toThrow(ConflictException);
    await expect(service.removePallet(deliveryId, pallet.data.id, admin())).rejects.toThrow(
      ConflictException,
    );
    await expect(service.softDelete(deliveryId, admin())).rejects.toThrow(ConflictException);
  });

  it("keeps resolving its supplier even if that supplier is later soft-deleted", async () => {
    await service.addPallet(
      deliveryId,
      palletDraft({ classification: "waste" }),
      admin(),
      workerId,
    );
    await service.sign(deliveryId, admin(), workerId);

    // The suppliers API refuses this while deliveries exist; done here directly to prove
    // the record survives even a bypass: hidden from pickers, never from the register.
    await db.update(suppliers).set({ deletedAt: new Date() }).where(eq(suppliers.id, supplierId));

    const detail = await service.findOne(deliveryId, admin());
    expect(detail.data.supplier).toEqual({ id: supplierId, code: "S014" });

    const listed = await service.list(LIST_DEFAULTS as never, admin());
    expect(listed.data.map((row) => row.id)).toContain(deliveryId);
  });
});

describe("deliveries — trash and restore", () => {
  let workerId: string;
  let supplierA: string;
  let supplierB: string;

  beforeEach(async () => {
    await resetDb(db);
    workerId = (await createUser(db)).id;
    supplierA = (await createSupplier(db)).id;
    supplierB = (await createSupplier(db)).id;
  });

  it("a deleted draft sits in the trash and restores with its number intact", async () => {
    const created = await service.create(header(supplierA));
    await service.addPallet(created.data.id, palletDraft(), admin(), workerId);

    await service.softDelete(created.data.id, admin());
    await expect(service.findOne(created.data.id, admin())).rejects.toThrow(NotFoundException);

    const trash = await service.listTrash(LIST_DEFAULTS as never, admin());
    expect(trash.data.map((row) => row.id)).toEqual([created.data.id]);
    expect(trash.data[0]?.deletedAt).toBeInstanceOf(Date);

    const restored = await service.restore(created.data.id, admin());
    expect(restored.data.reference).toBe(created.data.reference);
    expect(restored.data.palletCount).toBe(1);
  });

  it("the trash follows the delete rule's conditions", async () => {
    const own = await service.create(header(supplierA));
    const foreign = await service.create(header(supplierB));
    await service.softDelete(own.data.id, admin());
    await service.softDelete(foreign.data.id, admin());

    const scoped = ability({
      action: "delete",
      subject: "Delivery",
      conditions: { supplierId: supplierA },
    });

    const trash = await service.listTrash(LIST_DEFAULTS as never, scoped);
    expect(trash.data.map((row) => row.id)).toEqual([own.data.id]);
    await expect(service.restore(foreign.data.id, scoped)).rejects.toThrow(ForbiddenException);
  });

  it("a live row is not in the trash: restoring it reports 404", async () => {
    const created = await service.create(header(supplierA));
    await expect(service.restore(created.data.id, admin())).rejects.toThrow(NotFoundException);
  });
});

describe("deliveries — write rules", () => {
  let workerId: string;
  let ownDelivery: string;
  let foreignDelivery: string;
  let supplierA: string;

  beforeEach(async () => {
    await resetDb(db);
    workerId = (await createUser(db)).id;
    supplierA = (await createSupplier(db)).id;
    const supplierB = (await createSupplier(db)).id;
    ownDelivery = (await service.create(header(supplierA))).data.id;
    foreignDelivery = (await service.create(header(supplierB))).data.id;
  });

  it("a conditional update rule covers its rows and refuses the rest — signing too", async () => {
    const own = ability({
      action: "update",
      subject: "Delivery",
      conditions: { supplierId: supplierA },
    });

    await expect(
      service.update(ownDelivery, patch({ lotNo: "LOT-1" }), own),
    ).resolves.toMatchObject({ data: { lotNo: "LOT-1" } });

    await expect(service.update(foreignDelivery, patch({ lotNo: "LOT-2" }), own)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.addPallet(foreignDelivery, palletDraft(), own, workerId),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.sign(foreignDelivery, own, workerId)).rejects.toThrow(ForbiddenException);
  });

  it("a field-scoped rule splits the header from the pallet rows", async () => {
    const scaleStation = ability({
      action: "update",
      subject: "Delivery",
      fields: ["pallets"],
    });

    await expect(
      service.addPallet(ownDelivery, palletDraft(), scaleStation, workerId),
    ).resolves.toMatchObject({ data: { palletNo: 1 } });
    await expect(
      service.update(ownDelivery, patch({ lotNo: "LOT-X" }), scaleStation),
    ).rejects.toThrow(/lotNo/);
    // The sign-off is a field too — the account that fills the record in cannot close it.
    await expect(service.sign(ownDelivery, scaleStation, workerId)).rejects.toThrow(/sign/);

    const headerOnly = ability({
      action: "update",
      subject: "Delivery",
      fields: ["supplierId", "deliveredOn", "lotNo", "documents"],
    });

    await expect(
      service.update(ownDelivery, patch({ lotNo: "LOT-Y" }), headerOnly),
    ).resolves.toMatchObject({ data: { lotNo: "LOT-Y" } });
    await expect(
      service.addPallet(ownDelivery, palletDraft(), headerOnly, workerId),
    ).rejects.toThrow(/pallets/);
  });

  it("delete follows its own rule, not update's", async () => {
    const updatesOnly = ability({ action: "update", subject: "Delivery" });
    await expect(service.softDelete(ownDelivery, updatesOnly)).rejects.toThrow(ForbiddenException);

    const deleter = ability({ action: "delete", subject: "Delivery" });
    await expect(service.softDelete(ownDelivery, deleter)).resolves.toBeUndefined();
  });
});
