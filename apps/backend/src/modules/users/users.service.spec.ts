import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  ability,
  assignRole,
  connect,
  createRole,
  createSession,
  createUser,
  resetDb,
} from "@test/harness";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_KEY, SUPER_ROLE_KEY } from "@repo/access";
import { sessions } from "@repo/db";

import type { UpdateUserDto } from "./dto/update-user.dto";
import { AbilityService } from "../../lib/ability/ability.service";
import { RolesService } from "../roles/roles.service";
import { UsersService } from "./users.service";

const { db, end } = connect();
const rolesService = new RolesService(db);
const service = new UsersService(db, rolesService, new AbilityService(db));

afterAll(() => end());

const LIST_DEFAULTS = { skip: 0, take: 20 };
const patch = (fields: Partial<UpdateUserDto>) => fields as UpdateUserDto;

describe("users — read rules", () => {
  let self: string;
  let other: string;

  beforeEach(async () => {
    await resetDb(db);
    self = (await createUser(db)).id;
    other = (await createUser(db)).id;
    await createUser(db, { deletedAt: new Date() });
  });

  it("an unconditional reader sees every live account", async () => {
    const result = await service.list(
      LIST_DEFAULTS as never,
      ability({ action: "read", subject: "User" }),
    );
    expect(result.data).toHaveLength(2);
    expect(result.pagination?.total).toBe(2);
  });

  it("a self-only rule narrows the page and the total to one row", async () => {
    const own = ability({ action: "read", subject: "User", conditions: { id: self } });

    const result = await service.list(LIST_DEFAULTS as never, own);
    expect(result.data.map((row) => row.id)).toEqual([self]);
    expect(result.pagination?.total).toBe(1);
  });

  it("findOne hides an excluded account as 404", async () => {
    const own = ability({ action: "read", subject: "User", conditions: { id: self } });

    await expect(service.findOne(self, own)).resolves.toMatchObject({ data: { id: self } });
    await expect(service.findOne(other, own)).rejects.toThrow(NotFoundException);
  });
});

describe("users — write rules", () => {
  let self: string;
  let other: string;

  beforeEach(async () => {
    await resetDb(db);
    self = (await createUser(db)).id;
    other = (await createUser(db)).id;
  });

  it("a conditional update rule covers the own row only", async () => {
    const own = ability({ action: "update", subject: "User", conditions: { id: self } });

    await expect(service.update(self, patch({ name: "Renamed" }), own)).resolves.toMatchObject({
      data: { name: "Renamed" },
    });
    await expect(service.update(other, patch({ name: "Renamed" }), own)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("a name-only rule cannot change the email or take over the password", async () => {
    const support = ability({ action: "update", subject: "User", fields: ["name"] });

    await expect(service.update(other, patch({ name: "Fixed" }), support)).resolves.toMatchObject({
      data: { name: "Fixed" },
    });
    await expect(
      service.update(other, patch({ email: "new@test.local" }), support),
    ).rejects.toThrow(/email/);
    await expect(
      service.update(other, patch({ password: "hijacked-123" }), support),
    ).rejects.toThrow(/password/);
  });

  it("granting roles requires the roles field, which an account editor may lack", async () => {
    const accountEditor = ability({
      action: "update",
      subject: "User",
      fields: ["email", "name"],
    });
    const role = await createRole(db, [{ action: "read", subject: "Container" }]);

    await expect(
      service.setRoles(other, { roleIds: [role.id] }, self, accountEditor),
    ).rejects.toThrow(/roles/);

    const admin = ability({ action: "manage", subject: "all" });
    await expect(
      service.setRoles(other, { roleIds: [role.id] }, self, admin),
    ).resolves.toMatchObject({ data: [{ id: role.id }] });
  });

  it("nobody may edit their own roles, however privileged", async () => {
    const admin = ability({ action: "manage", subject: "all" });
    await expect(service.setRoles(self, { roleIds: [] }, self, admin)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe("users — the install must keep an administrator", () => {
  let lastAdmin: string;
  let bystander: string;
  let superRole: string;

  beforeEach(async () => {
    await resetDb(db);
    lastAdmin = (await createUser(db)).id;
    bystander = (await createUser(db)).id;
    superRole = (
      await createRole(db, [{ action: "manage", subject: "all" }], {
        key: SUPER_ROLE_KEY,
        isSystem: true,
      })
    ).id;
    await assignRole(db, lastAdmin, superRole);
  });

  it("refuses to strip the last admin's roles", async () => {
    const admin = ability({ action: "manage", subject: "all" });
    await expect(service.setRoles(lastAdmin, { roleIds: [] }, bystander, admin)).rejects.toThrow(
      ConflictException,
    );
  });

  it("refuses to delete the last admin, and relents once another exists", async () => {
    const admin = ability({ action: "manage", subject: "all" });
    await expect(service.softDelete(lastAdmin, admin)).rejects.toThrow(ConflictException);

    await assignRole(db, bystander, superRole);
    await expect(service.softDelete(lastAdmin, admin)).resolves.toBeUndefined();
    await expect(service.findOne(lastAdmin)).rejects.toThrow(NotFoundException);
  });
});

describe("users — module behaviour", () => {
  const admin = () => ability({ action: "manage", subject: "all" });

  beforeEach(() => resetDb(db));

  describe("create", () => {
    it("refuses a duplicate email and an unknown role id", async () => {
      const existing = await createUser(db);
      await expect(
        service.create({ email: existing.email, password: "password-123" } as never),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.create({
          email: "fresh@test.local",
          password: "password-123",
          roleIds: ["00000000-0000-0000-0000-000000000000"],
        } as never),
      ).rejects.toThrow(/Unknown role/);
    });

    it("hands a new account the default role when one is seeded, nothing otherwise", async () => {
      const bare = await service.create({
        email: "a@test.local",
        password: "password-123",
      } as never);
      expect(bare.data.roles).toEqual([]);

      const fallback = await createRole(db, [{ action: "read", subject: "Container" }], {
        key: DEFAULT_ROLE_KEY,
      });
      const withDefault = await service.create({
        email: "b@test.local",
        password: "password-123",
      } as never);
      expect(withDefault.data.roles.map((role) => role.id)).toEqual([fallback.id]);
    });
  });

  describe("update", () => {
    it("refuses moving onto another account's email", async () => {
      const target = await createUser(db);
      const other = await createUser(db);

      await expect(
        service.update(target.id, patch({ email: other.email }), admin()),
      ).rejects.toThrow(ConflictException);
    });

    it("a password change revokes every session immediately", async () => {
      const target = await createUser(db);
      const session = await createSession(db, target.id);

      await service.update(target.id, patch({ password: "brand-new-secret" }), admin());

      const [row] = await db.select().from(sessions).where(eq(sessions.id, session.id));
      expect(row?.revokedAt).not.toBeNull();
    });

    it("a name change leaves sessions alone", async () => {
      const target = await createUser(db);
      const session = await createSession(db, target.id);

      await service.update(target.id, patch({ name: "New Name" }), admin());

      const [row] = await db.select().from(sessions).where(eq(sessions.id, session.id));
      expect(row?.revokedAt).toBeNull();
    });

    it("writes nothing for an empty patch — the audit trail must not claim a change", async () => {
      const target = await createUser(db);

      const after = await service.update(target.id, patch({}), admin());
      expect(after.data.updatedAt).toEqual(target.updatedAt);
    });
  });

  describe("list — filters and order", () => {
    it("searches name and email, and filters by role key", async () => {
      const alice = await createUser(db, { email: "alice@test.local", name: "Alice Ames" });
      await createUser(db, { email: "bob@test.local", name: "Bob Brand" });

      const role = await createRole(db, []);
      await assignRole(db, alice.id, role.id);

      const reader = ability({ action: "read", subject: "User" });

      const byName = await service.list({ ...LIST_DEFAULTS, search: "ames" } as never, reader);
      expect(byName.data.map((row) => row.id)).toEqual([alice.id]);

      const byEmail = await service.list({ ...LIST_DEFAULTS, search: "bob@" } as never, reader);
      expect(byEmail.data.map((row) => row.name)).toEqual(["Bob Brand"]);

      const byRole = await service.list({ ...LIST_DEFAULTS, roleKey: role.key } as never, reader);
      expect(byRole.data.map((row) => row.id)).toEqual([alice.id]);
    });

    it("newest accounts come first", async () => {
      const oldest = await createUser(db, { createdAt: new Date(Date.now() - 3_000) });
      const middle = await createUser(db, { createdAt: new Date(Date.now() - 2_000) });
      const newest = await createUser(db, { createdAt: new Date(Date.now() - 1_000) });

      const result = await service.list(
        LIST_DEFAULTS as never,
        ability({ action: "read", subject: "User" }),
      );
      expect(result.data.map((row) => row.id)).toEqual([newest.id, middle.id, oldest.id]);
    });
  });

  describe("softDelete", () => {
    it("revokes the account's sessions and reports a second delete as 404", async () => {
      await createUser(db); // so the last-admin check never trips on an install with one account
      const target = await createUser(db);
      const session = await createSession(db, target.id);

      await service.softDelete(target.id, admin());

      const [row] = await db.select().from(sessions).where(eq(sessions.id, session.id));
      expect(row?.revokedAt).not.toBeNull();

      await expect(service.softDelete(target.id, admin())).rejects.toThrow(NotFoundException);
    });
  });

  describe("rulesOf", () => {
    it("returns the effective rules with placeholders resolved for that user", async () => {
      const target = await createUser(db);
      const role = await createRole(db, [
        { action: "read", subject: "Container", conditions: { assignedToId: "${user.id}" } },
      ]);
      await assignRole(db, target.id, role.id);

      const rules = await service.rulesOf(target.id);
      expect(rules.data).toEqual([
        { action: "read", subject: "Container", conditions: { assignedToId: target.id } },
      ]);

      await expect(service.rulesOf("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
