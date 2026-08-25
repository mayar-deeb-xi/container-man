import { ability, connect, createContainer, createUser, resetDb } from "@test/harness";
import { and, count, getTableColumns, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asSubject } from "@repo/access";
import { containers } from "@repo/db";

import {
  abilityWhere,
  assertConditionsTranslatable,
  UntranslatableRuleError,
} from "./ability-where";
import { CONDITION_COLUMNS } from "./condition-columns";

const columns = getTableColumns(containers);

describe("assertConditionsTranslatable — refusals", () => {
  const refusals: Array<[string, Record<string, unknown>, RegExp]> = [
    ["$regex", { containerNumber: { $regex: "^MSCU" } }, /\$regex/],
    ["$options", { containerNumber: { $options: "i" } }, /\$options/],
    ["$exists", { reeferSetpointC: { $exists: true } }, /\$exists/],
    ["$all", { notes: { $all: ["a"] } }, /\$all/],
    ["$size", { notes: { $size: 2 } }, /\$size/],
    ["$elemMatch", { notes: { $elemMatch: { $eq: "x" } } }, /\$elemMatch/],
    ["$where", { $where: "true" }, /\$where/],
    ["$nor", { $nor: [{ depot: "Hamburg" }] }, /\$nor/],
    ["$not nested", { depot: { $not: { $eq: "Hamburg" } } }, /\$not/],
    ["unknown column", { despot: "Hamburg" }, /"despot" is not a column/],
    ["dotted path", { "assignee.email": "x@y.z" }, /not a column/],
    ["string into number column", { sizeFt: { $gte: "40" } }, /expects a number/],
    ["fraction into integer column", { tareWeightKg: 2200.5 }, /whole number/],
    ["non-uuid into uuid column", { assignedToId: "not-a-uuid" }, /must be a UUID/],
    ["bad enum label", { status: "flying" }, /must be one of/],
    ["bad date literal", { nextInspectionOn: { $lte: "soon" } }, /YYYY-MM-DD/],
    ["timestamp column", { createdAt: { $lte: "2026-01-01" } }, /range operators only apply/],
    ["range over free text", { depot: { $gt: "A" } }, /range operators only apply/],
    ["range against null", { sizeFt: { $gt: null } }, /cannot compare against null/],
    ["empty $or", { $or: [] }, /non-empty array/],
    ["non-object $or branch", { $or: ["depot"] }, /must be a condition object/],
    ["empty branch inside $or", { $or: [{ depot: "X" }, {}] }, /empty condition object/],
    ["empty operator object", { depot: {} }, /empty operator object/],
    ["array deep equality", { depot: ["a", "b"] }, /use "\$in"/],
    ["$in given a scalar", { status: { $in: "available" } }, /expects an array/],
    ["boolean into text column", { depot: true }, /expects a text value/],
  ];

  for (const [name, conditions, message] of refusals) {
    it(`refuses ${name}`, () => {
      expect(() => assertConditionsTranslatable(conditions, CONDITION_COLUMNS.Container)).toThrow(
        UntranslatableRuleError,
      );
      expect(() => assertConditionsTranslatable(conditions, CONDITION_COLUMNS.Container)).toThrow(
        message,
      );
    });
  }

  it("accepts the surviving vocabulary", () => {
    const accepted: Record<string, unknown>[] = [
      { assignedToId: "00000000-0000-0000-0000-000000000000" },
      { assignedToId: null },
      { depot: { $ne: "Hamburg" } },
      { status: { $in: ["available", "loaded"] } },
      { depot: { $nin: ["Hamburg", "Antwerp"] } },
      { sizeFt: { $gt: 20, $lte: 45 } },
      { nextInspectionOn: { $lte: "2026-12-31" } },
      { $and: [{ depot: "Hamburg" }, { status: "available" }] },
      { $or: [{ assignedToId: null }, { sizeFt: 40 }] },
    ];

    for (const conditions of accepted) {
      expect(() =>
        assertConditionsTranslatable(conditions, CONDITION_COLUMNS.Container),
      ).not.toThrow();
    }
  });
});

describe("abilityWhere — with the local database", () => {
  const { db, end } = connect();

  let userA: string;
  let userB: string;

  beforeAll(async () => {
    await resetDb(db);

    userA = (await createUser(db)).id;
    userB = (await createUser(db)).id;

    // A spread designed to make every operator's edge visible: NULLs in every nullable
    // column that conditions touch, values on both sides of each range boundary, and a
    // soft-deleted row that no list may ever count.
    await createContainer(db, {
      assignedToId: userA,
      depot: "Hamburg",
      status: "available",
      sizeFt: 20,
      tareWeightKg: 2000,
      nextInspectionOn: "2026-01-15",
      reeferSetpointC: null,
    });
    await createContainer(db, {
      assignedToId: userA,
      depot: null,
      status: "loaded",
      sizeFt: 40,
      tareWeightKg: 3000,
      nextInspectionOn: null,
      reeferSetpointC: -18.5,
    });
    await createContainer(db, {
      assignedToId: userB,
      depot: "Rotterdam",
      status: "damaged",
      sizeFt: 40,
      tareWeightKg: 4000,
      nextInspectionOn: "2027-06-30",
      reeferSetpointC: 5,
    });
    await createContainer(db, {
      assignedToId: null,
      depot: "Hamburg",
      status: "retired",
      sizeFt: 45,
      tareWeightKg: 4800,
      nextInspectionOn: "2025-11-01",
      reeferSetpointC: 0,
    });
    await createContainer(db, { assignedToId: userB, deletedAt: new Date() });
  });

  afterAll(() => end());

  /**
   * The whole design in one assertion: the rows the compiled predicate selects must be
   * exactly the rows the in-memory evaluator accepts — same members, and the SQL count
   * (what `pagination.total` reports) must equal the in-memory count.
   */
  async function expectExactness(rules: Array<Record<string, unknown>>): Promise<void> {
    const built = ability(...rules);
    const where = abilityWhere(built, "read", "Container", columns);
    const live = isNull(containers.deletedAt);

    const viaSql = await db.select().from(containers).where(and(live, where));
    const everyRow = await db.select().from(containers).where(live);
    const viaMemory = everyRow.filter((row) => built.can("read", asSubject("Container", row)));

    expect(new Set(viaSql.map((row) => row.id))).toEqual(new Set(viaMemory.map((row) => row.id)));

    const [totals] = await db.select({ total: count() }).from(containers).where(and(live, where));
    expect(totals?.total).toBe(viaMemory.length);
  }

  const read = (conditions: Record<string, unknown>) => ({
    action: "read",
    subject: "Container",
    conditions,
  });

  const exactCases: Array<[string, () => Array<Record<string, unknown>>]> = [
    ["equality on uuid", () => [read({ assignedToId: userA })]],
    ["equality against null", () => [read({ assignedToId: null })]],
    ["$eq", () => [read({ assignedToId: { $eq: userA } })]],
    ["$ne — must keep NULL rows", () => [read({ depot: { $ne: "Hamburg" } })]],
    ["$ne on uuid — must keep unassigned rows", () => [read({ assignedToId: { $ne: userB } })]],
    ["$in over enum", () => [read({ status: { $in: ["available", "loaded"] } })]],
    ["$in with null in the list", () => [read({ depot: { $in: ["Hamburg", null] } })]],
    ["$nin — must keep NULL rows", () => [read({ depot: { $nin: ["Hamburg", "Antwerp"] } })]],
    ["$in with an empty list", () => [read({ status: { $in: [] } })]],
    ["$gte on smallint", () => [read({ sizeFt: { $gte: 40 } })]],
    ["$gt + $lte combined", () => [read({ sizeFt: { $gt: 20, $lte: 40 } })]],
    ["$lte on integer", () => [read({ tareWeightKg: { $lte: 3000 } })]],
    ["$lte over a NULLable numeric", () => [read({ reeferSetpointC: { $lte: 10 } })]],
    ["$gte over a NULLable numeric", () => [read({ reeferSetpointC: { $gte: -20 } })]],
    ["$lt with operand 0 over NULLs", () => [read({ reeferSetpointC: { $lt: 0 } })]],
    ["$lte with operand 0 over NULLs", () => [read({ reeferSetpointC: { $lte: 0 } })]],
    ["$gte with operand 0 over NULLs", () => [read({ reeferSetpointC: { $gte: 0 } })]],
    ["$gt with operand 0 over NULLs", () => [read({ reeferSetpointC: { $gt: 0 } })]],
    [
      "date range — NULL dates follow the evaluator, not intuition",
      () => [read({ nextInspectionOn: { $lte: "2026-12-31" } })],
    ],
    ["date $gte", () => [read({ nextInspectionOn: { $gte: "2026-01-15" } })]],
    ["$or", () => [read({ $or: [{ assignedToId: userA }, { assignedToId: null }] })]],
    ["$and", () => [read({ $and: [{ depot: "Hamburg" }, { status: "available" }] })]],
    [
      "nested $or of $and",
      () => [
        read({ $or: [{ $and: [{ sizeFt: 40 }, { status: "loaded" }] }, { depot: "Rotterdam" }] }),
      ],
    ],
    [
      "two conditional rules union (OR across rules)",
      () => [read({ assignedToId: userA }), read({ depot: "Hamburg" })],
    ],
    ["plain text equality", () => [read({ operator: "MSC" })]],
  ];

  for (const [name, rules] of exactCases) {
    it(`SQL and the in-memory evaluator agree: ${name}`, async () => {
      await expectExactness(rules());
    });
  }

  it("returns undefined for an unconditional grant", () => {
    expect(
      abilityWhere(ability({ action: "manage", subject: "all" }), "read", "Container", columns),
    ).toBeUndefined();
    expect(
      abilityWhere(ability({ action: "read", subject: "Container" }), "read", "Container", columns),
    ).toBeUndefined();
  });

  it("an unconditional rule beside a conditional one admits every row", () => {
    const built = ability(
      { action: "read", subject: "Container", conditions: { assignedToId: userA } },
      { action: "read", subject: "Container" },
    );
    expect(abilityWhere(built, "read", "Container", columns)).toBeUndefined();
  });

  it("no grant at all selects no rows", async () => {
    const where = abilityWhere(ability(), "read", "Container", columns);
    expect(where).toBeDefined();

    const rows = await db.select().from(containers).where(where);
    expect(rows).toHaveLength(0);
  });

  it("throws on a rule whose conditions no longer translate — never silently widens", () => {
    const built = ability({
      action: "read",
      subject: "Container",
      conditions: { containerNumber: { $regex: "^MSCU" } },
    });
    expect(() => abilityWhere(built, "read", "Container", columns)).toThrow(
      UntranslatableRuleError,
    );
  });

  it("throws on a stale deny rule — the feature is gone and must stay gone loudly", () => {
    const built = ability(
      { action: "read", subject: "Container" },
      { action: "read", subject: "Container", conditions: { depot: "Hamburg" }, inverted: true },
    );
    expect(() => abilityWhere(built, "read", "Container", columns)).toThrow(/inverted/);
  });
});
