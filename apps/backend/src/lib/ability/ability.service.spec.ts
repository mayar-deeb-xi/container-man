import {
  ability,
  assignRole,
  connect,
  createContainer,
  createRole,
  createUser,
  resetDb,
} from "@test/harness";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { asSubject } from "@repo/access";
import { permissions, rolePermissions, users } from "@repo/db";

import { AbilityService } from "./ability.service";

const { db, end } = connect();
const service = new AbilityService(db);

afterAll(() => end());
beforeEach(() => resetDb(db));

describe("AbilityService.forUser", () => {
  it("returns null for an unknown user and for a soft-deleted one", async () => {
    expect(await service.forUser("00000000-0000-0000-0000-000000000000")).toBeNull();

    const user = await createUser(db);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.id));
    expect(await service.forUser(user.id)).toBeNull();
  });

  it("resolves roles to rules with placeholders substituted for this user", async () => {
    const user = await createUser(db);
    const role = await createRole(db, [
      { action: "read", subject: "Container", conditions: { assignedToId: "${user.id}" } },
      { action: "read", subject: "User", conditions: { email: "${user.email}" } },
    ]);
    await assignRole(db, user.id, role.id);

    const access = await service.forUser(user.id);
    expect(access).not.toBeNull();
    expect(access?.roles.map((entry) => entry.key)).toEqual([role.key]);

    const containerRule = access?.rules.find((entry) => entry.subject === "Container");
    expect(containerRule?.conditions).toEqual({ assignedToId: user.id });

    const userRule = access?.rules.find((entry) => entry.subject === "User");
    expect(userRule?.conditions).toEqual({ email: user.email });
  });

  it("lists a role that grants nothing yet", async () => {
    const user = await createUser(db);
    const emptyRole = await createRole(db, []);
    await assignRole(db, user.id, emptyRole.id);

    const access = await service.forUser(user.id);
    expect(access?.roles.map((entry) => entry.key)).toEqual([emptyRole.key]);
    expect(access?.rules).toEqual([]);
  });

  it("merges the rules of every role the user holds", async () => {
    const user = await createUser(db);
    const reader = await createRole(db, [{ action: "read", subject: "Container" }]);
    const editor = await createRole(db, [
      { action: "update", subject: "Container", fields: ["status"] },
    ]);
    await assignRole(db, user.id, reader.id);
    await assignRole(db, user.id, editor.id);

    const access = await service.forUser(user.id);
    expect(access?.rules).toHaveLength(2);
    expect(access?.roles).toHaveLength(2);
  });

  it("drops a stored rule whose action or subject left the vocabulary", async () => {
    const user = await createUser(db);
    const role = await createRole(db, [{ action: "read", subject: "Container" }]);
    await assignRole(db, user.id, role.id);

    // A permission row naming a retired verb — exactly what a catalog change leaves
    // behind until the seed reconciles. It must grant nothing rather than confuse CASL.
    const [retired] = await db
      .insert(permissions)
      .values({ action: "frobnicate" as never, subject: "Container", description: "retired" })
      .returning({ id: permissions.id });
    if (!retired) throw new Error("insert failed");
    await db.insert(rolePermissions).values({ roleId: role.id, permissionId: retired.id });

    const access = await service.forUser(user.id);
    expect(access?.rules).toHaveLength(1);
    expect(access?.rules[0]?.action).toBe("read");
  });

  it("treats an empty stored conditions object as unconditional", async () => {
    const user = await createUser(db);
    const role = await createRole(db, [{ action: "read", subject: "Container", conditions: {} }]);
    await assignRole(db, user.id, role.id);

    const access = await service.forUser(user.id);
    // `packRule` strips the `{}` — a present-but-empty conditions would match nothing
    // under CASL, silently revoking the grant.
    expect(access?.rules[0]?.conditions).toBeUndefined();

    const built = ability(...(access?.rules ?? []));
    const row = await createContainer(db);
    expect(built.can("read", asSubject("Container", row))).toBe(true);
  });
});

describe("AbilityService.abilityFor", () => {
  it("builds an ability that answers exactly what the rules say", async () => {
    const user = await createUser(db);
    const other = await createUser(db);
    const role = await createRole(db, [
      { action: "read", subject: "Container", conditions: { assignedToId: "${user.id}" } },
    ]);
    await assignRole(db, user.id, role.id);

    const built = await service.abilityFor(user.id);
    expect(built).not.toBeNull();

    const own = await createContainer(db, { assignedToId: user.id });
    const foreign = await createContainer(db, { assignedToId: other.id });

    expect(built?.can("read", asSubject("Container", own))).toBe(true);
    expect(built?.can("read", asSubject("Container", foreign))).toBe(false);
    expect(built?.can("delete", asSubject("Container", own))).toBe(false);
  });
});
