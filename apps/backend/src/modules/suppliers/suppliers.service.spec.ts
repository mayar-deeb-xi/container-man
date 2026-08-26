import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ability, connect, createDelivery, createSupplier, resetDb } from "@test/harness";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { deliveries } from "@repo/db";

import type { CreateSupplierDto } from "./dto/create-supplier.dto";
import type { UpdateSupplierDto } from "./dto/update-supplier.dto";
import { SuppliersService } from "./suppliers.service";

const { db, end } = connect();
const service = new SuppliersService(db);

afterAll(() => end());

const LIST_DEFAULTS = { skip: 0, take: 20 };

/** The service is called the way the controller calls it — DTO shapes, post-transform. */
const patch = (fields: Partial<UpdateSupplierDto>) => fields as UpdateSupplierDto;

let counter = 0;
const draft = (fields: Partial<CreateSupplierDto> = {}) =>
  ({
    code: `NEW-${String(++counter).padStart(3, "0")}`,
    name: `Recycler ${counter} GmbH`,
    ...fields,
  }) as CreateSupplierDto;

const admin = () => ability({ action: "manage", subject: "all" });

describe("suppliers — module behaviour", () => {
  beforeEach(() => resetDb(db));

  describe("create", () => {
    it("returns the row, notes defaulted to null", async () => {
      const created = await service.create(draft({ code: "S014" }));
      expect(created.data).toMatchObject({ code: "S014", notes: null });
    });

    it("refuses a duplicate live code — and frees the code after a soft delete", async () => {
      const first = await service.create(draft({ code: "S014" }));
      await expect(service.create(draft({ code: "S014" }))).rejects.toThrow(ConflictException);

      // The unique index is partial: deleting the row releases the code for re-entry.
      await service.softDelete(first.data.id, admin());
      await expect(service.create(draft({ code: "S014" }))).resolves.toMatchObject({
        data: { code: "S014" },
      });
    });
  });

  describe("update", () => {
    it("edits in place and refuses renaming onto a live code", async () => {
      const first = await service.create(draft());
      const second = await service.create(draft());

      const renamed = await service.update(second.data.id, patch({ name: "Renamed AG" }), admin());
      expect(renamed.data.name).toBe("Renamed AG");

      await expect(
        service.update(second.data.id, patch({ code: first.data.code }), admin()),
      ).rejects.toThrow(ConflictException);
    });

    it("writes nothing for an empty patch", async () => {
      const supplier = await service.create(draft());
      const after = await service.update(supplier.data.id, patch({}), admin());
      expect(after.data.updatedAt).toEqual(supplier.data.updatedAt);
    });
  });

  describe("list", () => {
    it("orders the register by code and searches code and name", async () => {
      await service.create(draft({ code: "S020", name: "Beta Recycling" }));
      await service.create(draft({ code: "S010", name: "Alpha Metals" }));

      const all = await service.list(LIST_DEFAULTS as never, admin());
      expect(all.data.map((row) => row.code)).toEqual(["S010", "S020"]);

      // The code is stored uppercase; a lowercase pasted term still matches it.
      const byCode = await service.list({ ...LIST_DEFAULTS, search: "s02" } as never, admin());
      expect(byCode.data.map((row) => row.code)).toEqual(["S020"]);

      const byName = await service.list({ ...LIST_DEFAULTS, search: "alpha" } as never, admin());
      expect(byName.data.map((row) => row.code)).toEqual(["S010"]);
      expect(byName.pagination?.total).toBe(1);
    });

    it("a conditional read rule scopes the list exactly, and the canary stays silent", async () => {
      const kept = await service.create(draft({ code: "S001" }));
      await service.create(draft({ code: "S002" }));

      const logger = vi.spyOn(
        (service as unknown as { logger: { error: (message: string) => void } }).logger,
        "error",
      );

      const scoped = ability({ action: "read", subject: "Supplier", conditions: { code: "S001" } });
      const result = await service.list(LIST_DEFAULTS as never, scoped);

      expect(result.data.map((row) => row.id)).toEqual([kept.data.id]);
      expect(result.pagination?.total).toBe(1);
      expect(logger).not.toHaveBeenCalled();
      logger.mockRestore();
    });

    it("findOne answers 404, not 403, for a supplier the conditions exclude", async () => {
      const own = await service.create(draft({ code: "S001" }));
      const foreign = await service.create(draft({ code: "S002" }));

      const scoped = ability({ action: "read", subject: "Supplier", conditions: { code: "S001" } });
      await expect(service.findOne(own.data.id, scoped)).resolves.toMatchObject({
        data: { id: own.data.id },
      });
      await expect(service.findOne(foreign.data.id, scoped)).rejects.toThrow(NotFoundException);
    });
  });

  describe("delete and referenced deliveries", () => {
    it("refuses deleting a supplier with recorded deliveries — even trashed ones", async () => {
      const supplier = await createSupplier(db);
      const delivery = await createDelivery(db, { supplierId: supplier.id });

      await expect(service.softDelete(supplier.id, admin())).rejects.toThrow(ConflictException);

      // A draft in the trash still resolves its supplier, so it still pins the row.
      await db
        .update(deliveries)
        .set({ deletedAt: new Date() })
        .where(eq(deliveries.id, delivery.id));
      await expect(service.softDelete(supplier.id, admin())).rejects.toThrow(ConflictException);
    });

    it("delete follows its own rule, not update's", async () => {
      const supplier = await service.create(draft());

      const updatesOnly = ability({ action: "update", subject: "Supplier" });
      await expect(service.softDelete(supplier.data.id, updatesOnly)).rejects.toThrow(
        ForbiddenException,
      );

      const deleter = ability({ action: "delete", subject: "Supplier" });
      await expect(service.softDelete(supplier.data.id, deleter)).resolves.toBeUndefined();

      await expect(service.findOne(supplier.data.id, admin())).rejects.toThrow(NotFoundException);
    });
  });

  describe("trash and restore", () => {
    it("lists deleted rows newest first and restores them into every live read", async () => {
      const first = await service.create(draft());
      const second = await service.create(draft());
      await service.softDelete(first.data.id, admin());
      await service.softDelete(second.data.id, admin());

      const trash = await service.listTrash(LIST_DEFAULTS as never, admin());
      expect(trash.data.map((row) => row.id)).toEqual([second.data.id, first.data.id]);
      for (const row of trash.data) expect(row.deletedAt).toBeInstanceOf(Date);

      const restored = await service.restore(first.data.id, admin());
      expect(restored.data.id).toBe(first.data.id);
      await expect(service.findOne(first.data.id, admin())).resolves.toMatchObject({
        data: { id: first.data.id },
      });
    });

    it("refuses restoring onto a code a live supplier has since taken", async () => {
      const original = await service.create(draft({ code: "S014" }));
      await service.softDelete(original.data.id, admin());
      await service.create(draft({ code: "S014" }));

      await expect(service.restore(original.data.id, admin())).rejects.toThrow(ConflictException);
    });

    it("a live row is not in the trash: restoring it reports 404", async () => {
      const supplier = await service.create(draft());
      await expect(service.restore(supplier.data.id, admin())).rejects.toThrow(NotFoundException);
    });
  });
});
