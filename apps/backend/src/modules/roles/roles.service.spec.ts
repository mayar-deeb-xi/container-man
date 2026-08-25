import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ability, assignRole, connect, createRole, createUser, resetDb } from "@test/harness";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SUPER_ROLE_KEY } from "@repo/access";

import type { RuleDto } from "./dto/rule.dto";
import { RolesService } from "./roles.service";

const { db, end } = connect();
const service = new RolesService(db);

afterAll(() => end());
beforeEach(() => resetDb(db));

const admin = () => ability({ action: "manage", subject: "all" });
const LIST_DEFAULTS = { skip: 0, take: 20 };
const rules = (...entries: Array<Record<string, unknown>>) => entries as unknown as RuleDto[];

describe("roles — what a role may store", () => {
  it("persists a rule's conditions and fields, and nothing else", async () => {
    const created = await service.create({
      key: "yard",
      name: "Yard hand",
      rules: rules(
        {
          action: "update",
          subject: "Container",
          conditions: { assignedToId: "${user.id}" },
          fields: ["status", "depot"],
        },
        { action: "read", subject: "Container" },
      ),
    } as never);

    const stored = created.data.rules;
    expect(stored).toHaveLength(2);

    const update = stored.find((rule) => rule.action === "update");
    expect(update?.conditions).toEqual({ assignedToId: "${user.id}" });
    expect(update?.fields).toEqual(["status", "depot"]);
    expect(update).not.toHaveProperty("inverted");
    expect(update).not.toHaveProperty("reason");
  });

  it("refuses a pair the catalog does not offer", async () => {
    // `read all` is a valid vocabulary pair but deliberately not in PERMISSION_CATALOG,
    // so it must not be grantable — a rule nothing checks is a lie in the matrix.
    await expect(
      service.create({
        key: "r1",
        name: "R1",
        rules: rules({ action: "read", subject: "all" }),
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it("refuses the same cell twice in one payload", async () => {
    await expect(
      service.create({
        key: "r2",
        name: "R2",
        rules: rules(
          { action: "read", subject: "Container" },
          { action: "read", subject: "Container", conditions: { depot: "Hamburg" } },
        ),
      } as never),
    ).rejects.toThrow(/Duplicate/);
  });
});

describe("roles — who may change what a role grants", () => {
  it("replacing a role's rules requires the permissions field", async () => {
    const role = await createRole(db, []);

    const renamerOnly = ability({
      action: "update",
      subject: "Role",
      fields: ["name", "description"],
    });
    await expect(
      service.setPermissions(
        role.id,
        { rules: rules({ action: "read", subject: "Container" }) } as never,
        renamerOnly,
      ),
    ).rejects.toThrow(ForbiddenException);

    const granted = await service.setPermissions(
      role.id,
      { rules: rules({ action: "read", subject: "Container" }) } as never,
      admin(),
    );
    expect(granted.data.rules).toHaveLength(1);
  });

  it("replaces wholesale — anything omitted is revoked", async () => {
    const role = await createRole(db, [
      { action: "read", subject: "Container" },
      { action: "delete", subject: "Container" },
    ]);

    const after = await service.setPermissions(
      role.id,
      { rules: rules({ action: "read", subject: "Container" }) } as never,
      admin(),
    );

    expect(after.data.rules).toHaveLength(1);
    expect(after.data.rules[0]?.action).toBe("read");
  });

  it("the superuser role's rules cannot be edited at all", async () => {
    const superRole = await createRole(db, [{ action: "manage", subject: "all" }], {
      key: SUPER_ROLE_KEY,
      isSystem: true,
    });

    await expect(
      service.setPermissions(superRole.id, { rules: [] } as never, admin()),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe("roles — lifecycle guard rails", () => {
  it("a system role's key is fixed, its display name is not", async () => {
    const system = await createRole(db, [], { isSystem: true });

    await expect(
      service.update(system.id, { key: "renamed-key" } as never, admin()),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.update(system.id, { name: "Friendlier name" } as never, admin()),
    ).resolves.toMatchObject({ data: { name: "Friendlier name" } });
  });

  it("a system role cannot be deleted; a held role must be unassigned first", async () => {
    const system = await createRole(db, [], { isSystem: true });
    await expect(service.remove(system.id)).rejects.toThrow(ForbiddenException);

    const held = await createRole(db, []);
    const holder = await createUser(db);
    await assignRole(db, holder.id, held.id);
    await expect(service.remove(held.id)).rejects.toThrow(ConflictException);

    const free = await createRole(db, []);
    await expect(service.remove(free.id)).resolves.toBeUndefined();
  });
});

describe("roles — module behaviour", () => {
  describe("list", () => {
    it("counts permissions and holders without the joins multiplying each other", async () => {
      // 3 permissions × 2 holders is the exact shape that would report 6 and 6 if the
      // two left joins were counted naively.
      const role = await createRole(db, [
        { action: "read", subject: "Container" },
        { action: "update", subject: "Container" },
        { action: "delete", subject: "Container" },
      ]);
      await assignRole(db, (await createUser(db)).id, role.id);
      await assignRole(db, (await createUser(db)).id, role.id);

      const result = await service.list(LIST_DEFAULTS as never);
      const row = result.data.find((entry) => entry.id === role.id);
      expect(row?.permissionCount).toBe(3);
      expect(row?.userCount).toBe(2);
    });

    it("does not count soft-deleted holders", async () => {
      const role = await createRole(db, []);
      await assignRole(db, (await createUser(db)).id, role.id);
      await assignRole(db, (await createUser(db, { deletedAt: new Date() })).id, role.id);

      const result = await service.list(LIST_DEFAULTS as never);
      expect(result.data.find((entry) => entry.id === role.id)?.userCount).toBe(1);
    });

    it("searches by key and name", async () => {
      const yard = await createRole(db, [], { key: "yard-hand", name: "Yard hand" });
      await createRole(db, [], { key: "auditor", name: "Auditor" });

      const byKey = await service.list({ ...LIST_DEFAULTS, search: "yard" } as never);
      expect(byKey.data.map((entry) => entry.id)).toEqual([yard.id]);

      const byName = await service.list({ ...LIST_DEFAULTS, search: "audit" } as never);
      expect(byName.data.map((entry) => entry.key)).toEqual(["auditor"]);
    });

    it("puts system roles first and flags the superuser row as locked", async () => {
      await createRole(db, [], { key: "zz-custom", name: "AA Custom" });
      const system = await createRole(db, [], {
        key: SUPER_ROLE_KEY,
        name: "ZZ Admin",
        isSystem: true,
      });

      const result = await service.list(LIST_DEFAULTS as never);
      expect(result.data[0]?.id).toBe(system.id);
      expect(result.data[0]?.isLocked).toBe(true);
      expect(result.data[1]?.isLocked).toBe(false);
    });
  });

  describe("lifecycle", () => {
    it("refuses a duplicate key on create and on rename", async () => {
      await createRole(db, [], { key: "taken" });

      await expect(service.create({ key: "taken", name: "Taken again" } as never)).rejects.toThrow(
        ConflictException,
      );

      const other = await createRole(db, []);
      await expect(service.update(other.id, { key: "taken" } as never, admin())).rejects.toThrow(
        ConflictException,
      );
    });

    it("findOne reports an unknown role as 404", async () => {
      await expect(service.findOne("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("forUsers", () => {
    it("maps each user to their roles, empty arrays included", async () => {
      const holder = await createUser(db);
      const empty = await createUser(db);
      const role = await createRole(db, []);
      await assignRole(db, holder.id, role.id);

      const byUser = await service.forUsers([holder.id, empty.id]);
      expect(byUser.get(holder.id)?.map((entry) => entry.id)).toEqual([role.id]);
      expect(byUser.get(empty.id)).toEqual([]);
    });
  });
});
