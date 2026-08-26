import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ability, connect, createContainer, createUser, resetDb } from "@test/harness";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateContainerDto } from "./dto/create-container.dto";
import type { UpdateContainerDto } from "./dto/update-container.dto";
import { ContainersService } from "./containers.service";
import { UNASSIGNED } from "./dto/list-containers.dto";

const { db, end } = connect();
const service = new ContainersService(db);

afterAll(() => end());

const LIST_DEFAULTS = { skip: 0, take: 20 };

/** The service is called the way the controller calls it — DTO shapes, not raw objects. */
const patch = (fields: Partial<UpdateContainerDto>) => fields as UpdateContainerDto;

describe("containers — read rules", () => {
  let userA: string;
  let userB: string;
  let ownBox: string;
  let secondOwnBox: string;
  let foreignBox: string;

  beforeEach(async () => {
    await resetDb(db);
    userA = (await createUser(db)).id;
    userB = (await createUser(db)).id;
    ownBox = (await createContainer(db, { assignedToId: userA, depot: "Hamburg" })).id;
    secondOwnBox = (await createContainer(db, { assignedToId: userA, depot: "Rotterdam" })).id;
    foreignBox = (await createContainer(db, { assignedToId: userB })).id;
    await createContainer(db, { assignedToId: null });
    await createContainer(db, { assignedToId: userB, deletedAt: new Date() });
  });

  it("an unconditional reader sees every live box, and total says so", async () => {
    const result = await service.list(
      LIST_DEFAULTS as never,
      ability({ action: "read", subject: "Container" }),
    );
    expect(result.data).toHaveLength(4);
    expect(result.pagination?.total).toBe(4);
  });

  it("a conditional reader gets a full, exactly-counted page of their own boxes", async () => {
    const own = ability({
      action: "read",
      subject: "Container",
      conditions: { assignedToId: userA },
    });

    const result = await service.list(LIST_DEFAULTS as never, own);
    expect(new Set(result.data.map((row) => row.id))).toEqual(new Set([ownBox, secondOwnBox]));
    expect(result.pagination?.total).toBe(2);
  });

  it("the canary stays silent when the push-down did its job", async () => {
    const logger = vi.spyOn(
      (service as unknown as { logger: { error: (message: string) => void } }).logger,
      "error",
    );

    await service.list(
      LIST_DEFAULTS as never,
      ability({ action: "read", subject: "Container", conditions: { assignedToId: userA } }),
    );

    expect(logger).not.toHaveBeenCalled();
    logger.mockRestore();
  });

  it("pagination stays honest under a conditional rule", async () => {
    const own = ability({
      action: "read",
      subject: "Container",
      conditions: { assignedToId: userA },
    });

    const first = await service.list({ skip: 0, take: 1 } as never, own);
    expect(first.data).toHaveLength(1);
    expect(first.pagination?.total).toBe(2);

    const past = await service.list({ skip: 2, take: 1 } as never, own);
    expect(past.data).toHaveLength(0);
    expect(past.pagination?.total).toBe(2);
  });

  it("other list filters still compose with the rule", async () => {
    const own = ability({
      action: "read",
      subject: "Container",
      conditions: { assignedToId: userA },
    });

    const result = await service.list({ ...LIST_DEFAULTS, search: "hamburg" } as never, own);
    expect(result.data.map((row) => row.id)).toEqual([ownBox]);
    expect(result.pagination?.total).toBe(1);
  });

  it("findOne answers 404, not 403, for a box the conditions exclude", async () => {
    const own = ability({
      action: "read",
      subject: "Container",
      conditions: { assignedToId: userA },
    });

    await expect(service.findOne(ownBox, own)).resolves.toMatchObject({ data: { id: ownBox } });
    await expect(service.findOne(foreignBox, own)).rejects.toThrow(NotFoundException);
  });
});

describe("containers — write rules", () => {
  let userA: string;
  let userB: string;
  let ownBox: string;
  let foreignBox: string;

  beforeEach(async () => {
    await resetDb(db);
    userA = (await createUser(db)).id;
    userB = (await createUser(db)).id;
    ownBox = (await createContainer(db, { assignedToId: userA })).id;
    foreignBox = (await createContainer(db, { assignedToId: userB })).id;
  });

  it("a conditional update rule covers own boxes and refuses foreign ones", async () => {
    const own = ability({
      action: "update",
      subject: "Container",
      conditions: { assignedToId: userA },
    });

    const updated = await service.update(ownBox, patch({ depot: "Antwerp" }), own);
    expect(updated.data.depot).toBe("Antwerp");

    await expect(service.update(foreignBox, patch({ depot: "Antwerp" }), own)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("a field-scoped rule allows exactly its columns and names the refused one", async () => {
    const yardHand = ability({
      action: "update",
      subject: "Container",
      conditions: { assignedToId: userA },
      fields: ["status", "depot"],
    });

    const moved = await service.update(ownBox, patch({ status: "loaded" }), yardHand);
    expect(moved.data.status).toBe("loaded");

    await expect(service.update(ownBox, patch({ assignedToId: userB }), yardHand)).rejects.toThrow(
      /assignedToId/,
    );
  });

  it("conditions and fields are one rule — the right columns on the wrong box still refuse", async () => {
    const yardHand = ability({
      action: "update",
      subject: "Container",
      conditions: { assignedToId: userA },
      fields: ["status"],
    });

    await expect(service.update(foreignBox, patch({ status: "loaded" }), yardHand)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("delete follows its own rule, not update's", async () => {
    const updatesOnly = ability({
      action: "update",
      subject: "Container",
      conditions: { assignedToId: userA },
    });
    await expect(service.softDelete(ownBox, updatesOnly)).rejects.toThrow(ForbiddenException);

    const deleter = ability({
      action: "delete",
      subject: "Container",
      conditions: { assignedToId: userA },
    });
    await expect(service.softDelete(foreignBox, deleter)).rejects.toThrow(ForbiddenException);
    await expect(service.softDelete(ownBox, deleter)).resolves.toBeUndefined();

    // Soft-deleted means gone from every read.
    await expect(
      service.findOne(ownBox, ability({ action: "manage", subject: "all" })),
    ).rejects.toThrow(NotFoundException);
  });

  it("manage all covers every action on every box", async () => {
    const admin = ability({ action: "manage", subject: "all" });

    await expect(
      service.update(foreignBox, patch({ notes: "checked" }), admin),
    ).resolves.toMatchObject({
      data: { notes: "checked" },
    });
    await expect(service.softDelete(foreignBox, admin)).resolves.toBeUndefined();
  });
});

describe("containers — module behaviour", () => {
  const admin = () => ability({ action: "manage", subject: "all" });

  let counter = 0;
  const draft = (fields: Partial<CreateContainerDto> = {}) =>
    ({
      containerNumber: `DRFU${String(++counter).padStart(6, "0")}1`,
      type: "dry",
      sizeFt: 20,
      tareWeightKg: 2200,
      maxGrossWeightKg: 24000,
      ...fields,
    }) as CreateContainerDto;

  beforeEach(() => resetDb(db));

  describe("create", () => {
    it("returns the entity with the derived payload and the embedded assignee", async () => {
      const user = await createUser(db);
      const created = await service.create(draft({ assignedToId: user.id }));

      // Payload is derived, never stored — gross minus tare.
      expect(created.data.payloadKg).toBe(24000 - 2200);
      expect(created.data.assignedTo).toMatchObject({
        id: user.id,
        email: expect.stringContaining("@"),
      });
    });

    it("refuses a duplicate live number — and frees the number after a soft delete", async () => {
      const first = await service.create(draft({ containerNumber: "MSCU1234565" }));
      await expect(service.create(draft({ containerNumber: "MSCU1234565" }))).rejects.toThrow(
        ConflictException,
      );

      // The unique index is partial: deleting the row releases the identity for re-entry.
      await service.softDelete(first.data.id, admin());
      await expect(
        service.create(draft({ containerNumber: "MSCU1234565" })),
      ).resolves.toMatchObject({
        data: { containerNumber: "MSCU1234565" },
      });
    });

    it("refuses a plate whose gross does not exceed the tare", async () => {
      await expect(
        service.create(draft({ tareWeightKg: 24000, maxGrossWeightKg: 24000 })),
      ).rejects.toThrow(BadRequestException);
    });

    it("refuses a setpoint on anything but a reefer, and stores it on one", async () => {
      await expect(service.create(draft({ type: "dry", reeferSetpointC: -18 }))).rejects.toThrow(
        BadRequestException,
      );

      const reefer = await service.create(draft({ type: "reefer", reeferSetpointC: -18 }));
      expect(reefer.data.reeferSetpointC).toBe(-18);
    });

    it("refuses an assignee that does not exist or was deleted", async () => {
      await expect(
        service.create(draft({ assignedToId: "00000000-0000-0000-0000-000000000000" })),
      ).rejects.toThrow(BadRequestException);

      const gone = await createUser(db, { deletedAt: new Date() });
      await expect(service.create(draft({ assignedToId: gone.id }))).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("update", () => {
    it("clears the setpoint when a reefer is converted to a dry box", async () => {
      const reefer = await service.create(draft({ type: "reefer", reeferSetpointC: -18 }));

      const converted = await service.update(reefer.data.id, patch({ type: "dry" }), admin());
      expect(converted.data.type).toBe("dry");
      expect(converted.data.reeferSetpointC).toBeNull();
    });

    it("validates the plate against the row as it will be, not as it was", async () => {
      const box = await service.create(draft({ tareWeightKg: 2200, maxGrossWeightKg: 24000 }));

      await expect(
        service.update(box.data.id, patch({ tareWeightKg: 24000 }), admin()),
      ).rejects.toThrow(BadRequestException);
    });

    it("refuses renaming a box onto another live box's number", async () => {
      const first = await service.create(draft());
      const second = await service.create(draft());

      await expect(
        service.update(
          second.data.id,
          patch({ containerNumber: first.data.containerNumber }),
          admin(),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("writes nothing for an empty patch — the audit trail must not claim a change", async () => {
      const box = await service.create(draft());

      const after = await service.update(box.data.id, patch({}), admin());
      expect(after.data.updatedAt).toEqual(box.data.updatedAt);
    });
  });

  describe("list — filters", () => {
    const admin = () => ability({ action: "read", subject: "Container" });
    const iso = (daysFromToday: number) =>
      new Date(Date.now() + daysFromToday * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let pasted: string;
    let overdue: string;
    let dueSoon: string;

    beforeEach(async () => {
      pasted = (
        await createContainer(db, {
          containerNumber: "MSCU1234565",
          sizeFt: 40,
          type: "reefer",
          status: "loaded",
        })
      ).id;
      overdue = (await createContainer(db, { nextInspectionOn: iso(-10) })).id;
      dueSoon = (await createContainer(db, { nextInspectionOn: iso(10), assignedToId: null })).id;
      await createContainer(db, { nextInspectionOn: iso(60) });
      await createContainer(db, {
        nextInspectionOn: null,
        assignedToId: (await createUser(db)).id,
      });
    });

    it('finds a box from a messy pasted number: "mscu 123456"', async () => {
      const result = await service.list(
        { ...LIST_DEFAULTS, search: "mscu 123456" } as never,
        admin(),
      );
      expect(result.data.map((row) => row.id)).toEqual([pasted]);
    });

    it("filters by status, type and size", async () => {
      const byStatus = await service.list({ ...LIST_DEFAULTS, status: "loaded" } as never, admin());
      expect(byStatus.data.map((row) => row.id)).toEqual([pasted]);

      const byType = await service.list({ ...LIST_DEFAULTS, type: "reefer" } as never, admin());
      expect(byType.data.map((row) => row.id)).toEqual([pasted]);

      const bySize = await service.list({ ...LIST_DEFAULTS, sizeFt: 40 } as never, admin());
      expect(bySize.data.map((row) => row.id)).toEqual([pasted]);
    });

    it('"unassigned" is a filter value, not an id', async () => {
      const result = await service.list(
        { ...LIST_DEFAULTS, assignedToId: UNASSIGNED } as never,
        admin(),
      );
      const everyRow = await service.list(LIST_DEFAULTS as never, admin());

      const unassigned = everyRow.data
        .filter((row) => row.assignedTo === null)
        .map((row) => row.id);
      expect(new Set(result.data.map((row) => row.id))).toEqual(new Set(unassigned));
    });

    it("inspectionDue keeps overdue and soon-due boxes, drops far-future and undated ones", async () => {
      const result = await service.list(
        { ...LIST_DEFAULTS, inspectionDue: true } as never,
        admin(),
      );
      expect(new Set(result.data.map((row) => row.id))).toEqual(new Set([overdue, dueSoon]));
    });

    it("orders the register by container number", async () => {
      const result = await service.list(LIST_DEFAULTS as never, admin());
      const numbers = result.data.map((row) => row.containerNumber);
      expect(numbers).toEqual([...numbers].sort());
    });
  });
});

describe("containers — trash and restore", () => {
  const admin = () => ability({ action: "manage", subject: "all" });
  const deleter = () => ability({ action: "delete", subject: "Container" });

  let liveBox: string;
  let oldTrash: string;
  let newTrash: string;

  beforeEach(async () => {
    await resetDb(db);
    liveBox = (await createContainer(db, { depot: "Hamburg" })).id;
    oldTrash = (
      await createContainer(db, { depot: "Rotterdam", deletedAt: new Date("2026-01-01") })
    ).id;
    newTrash = (
      await createContainer(db, { depot: "Antwerp", deletedAt: new Date("2026-06-01") })
    ).id;
  });

  it("lists only deleted rows, newest deletion first, with deletedAt set", async () => {
    const result = await service.listTrash(LIST_DEFAULTS as never, deleter());

    expect(result.data.map((row) => row.id)).toEqual([newTrash, oldTrash]);
    expect(result.pagination?.total).toBe(2);
    for (const row of result.data) expect(row.deletedAt).toBeInstanceOf(Date);
  });

  it("a conditional delete rule scopes the trash to the caller's own mistakes", async () => {
    const owner = (await createUser(db)).id;
    const ownTrashed = (
      await createContainer(db, { assignedToId: owner, deletedAt: new Date() })
    ).id;

    const ownOnly = ability({
      action: "delete",
      subject: "Container",
      conditions: { assignedToId: owner },
    });

    const result = await service.listTrash(LIST_DEFAULTS as never, ownOnly);
    expect(result.data.map((row) => row.id)).toEqual([ownTrashed]);
    expect(result.pagination?.total).toBe(1);
  });

  it("search reaches into the trash the same way it reaches the register", async () => {
    const result = await service.listTrash(
      { ...LIST_DEFAULTS, search: "rotterdam" } as never,
      deleter(),
    );
    expect(result.data.map((row) => row.id)).toEqual([oldTrash]);
  });

  it("restore clears deletedAt and the row is back in every live read", async () => {
    const restored = await service.restore(oldTrash, deleter());
    expect(restored.data.id).toBe(oldTrash);

    await expect(service.findOne(oldTrash, admin())).resolves.toMatchObject({
      data: { id: oldTrash },
    });

    const trash = await service.listTrash(LIST_DEFAULTS as never, deleter());
    expect(trash.data.map((row) => row.id)).toEqual([newTrash]);
  });

  it("refuses to restore onto a number a live box has since taken", async () => {
    const first = await createContainer(db, {
      containerNumber: "MSCU1234565",
      deletedAt: new Date(),
    });
    // The partial unique index freed the number, so this re-entry is legitimate…
    await createContainer(db, { containerNumber: "MSCU1234565" });

    // …and restoring the original would mint a duplicate, so it must refuse.
    await expect(service.restore(first.id, deleter())).rejects.toThrow(ConflictException);
  });

  it("restore follows the delete rule's conditions, like the delete it undoes", async () => {
    const owner = (await createUser(db)).id;
    const ownOnly = ability({
      action: "delete",
      subject: "Container",
      conditions: { assignedToId: owner },
    });

    await expect(service.restore(oldTrash, ownOnly)).rejects.toThrow(ForbiddenException);
  });

  it("a live row is not in the trash: restoring it reports 404", async () => {
    await expect(service.restore(liveBox, deleter())).rejects.toThrow(NotFoundException);
  });
});
