import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";

import { MAX_CONDITIONS_BYTES, MAX_CONDITIONS_DEPTH, RuleDto } from "./rule.dto";

/** Every constraint message the DTO reports for this input, flattened. */
async function problems(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(RuleDto, input);
  const errors = await validate(dto);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

const rule = (overrides: Record<string, unknown>) => ({
  action: "read",
  subject: "Container",
  ...overrides,
});

describe("RuleDto — conditions are validated by compiling them", () => {
  it("accepts the vocabulary the translator supports", async () => {
    const accepted: Record<string, unknown>[] = [
      rule({ conditions: { assignedToId: "${user.id}" } }),
      rule({ conditions: { assignedToId: null } }),
      rule({ conditions: { operator: "${user.email}" } }),
      rule({ conditions: { depot: "depot-${user.id}" } }),
      rule({ conditions: { status: { $in: ["available", "loaded"] } } }),
      rule({ conditions: { sizeFt: { $gte: 20, $lte: 45 } } }),
      rule({ conditions: { nextInspectionOn: { $lte: "2026-12-31" } } }),
      rule({
        conditions: { $or: [{ assignedToId: "${user.id}" }, { assignedToId: null }] },
      }),
      { action: "update", subject: "User", conditions: { id: "${user.id}" } },
      { action: "read", subject: "Role", conditions: { isSystem: false } },
    ];

    for (const input of accepted) {
      await expect(problems(input), JSON.stringify(input)).resolves.toEqual([]);
    }
  });

  it("collapses an empty conditions object to null and accepts it", async () => {
    const dto = plainToInstance(RuleDto, rule({ conditions: {} }));
    expect(dto.conditions).toBeNull();
    await expect(validate(dto)).resolves.toEqual([]);
  });

  const refusals: Array<[string, Record<string, unknown>, RegExp]> = [
    ["$regex", rule({ conditions: { containerNumber: { $regex: "^MSCU" } } }), /\$regex/],
    ["$exists", rule({ conditions: { reeferSetpointC: { $exists: true } } }), /\$exists/],
    ["$nor", rule({ conditions: { $nor: [{ depot: "Hamburg" }] } }), /\$nor/],
    ["$not", rule({ conditions: { depot: { $not: { $eq: "x" } } } }), /\$not/],
    ["$all", rule({ conditions: { notes: { $all: ["x"] } } }), /\$all/],
    ["$size", rule({ conditions: { notes: { $size: 1 } } }), /\$size/],
    ["$elemMatch", rule({ conditions: { notes: { $elemMatch: { $eq: "x" } } } }), /\$elemMatch/],
    ["a key that is not a column", rule({ conditions: { despot: "Hamburg" } }), /"despot"/],
    ["a value of the wrong type", rule({ conditions: { sizeFt: "40" } }), /expects a number/],
    ["a label outside the enum", rule({ conditions: { status: "flying" } }), /must be one of/],
    ["a range over free text", rule({ conditions: { depot: { $gt: "A" } } }), /range operators/],
    [
      "a timestamp column",
      rule({ conditions: { createdAt: { $gte: "2026-01-01" } } }),
      /range operators/,
    ],
    ["an array as a value", rule({ conditions: { depot: ["a", "b"] } }), /\$in/],
    ["an empty $or", rule({ conditions: { $or: [] } }), /non-empty/],
    [
      "the email placeholder bound to a uuid column",
      rule({ conditions: { assignedToId: "${user.email}" } }),
      /must be a UUID/,
    ],
    [
      "an unknown placeholder",
      rule({ conditions: { assignedToId: "${user.role}" } }),
      /unknown placeholder/,
    ],
    [
      "conditions on an all rule",
      { action: "manage", subject: "all", conditions: { depot: "Hamburg" } },
      /"all" rule/,
    ],
    ["conditions that are not an object", rule({ conditions: ["depot"] }), /JSON object/],
  ];

  for (const [name, input, message] of refusals) {
    it(`refuses ${name}`, async () => {
      const found = await problems(input);
      expect(found.join("\n")).toMatch(message);
    });
  }

  it("bounds the size and depth of a condition payload", async () => {
    const oversized = rule({ conditions: { notes: "x".repeat(MAX_CONDITIONS_BYTES) } });
    expect((await problems(oversized)).join("\n")).toMatch(/under/);

    let nested: Record<string, unknown> = { depot: "Hamburg" };
    for (let level = 0; level <= MAX_CONDITIONS_DEPTH; level += 1) nested = { $and: [nested] };
    expect((await problems(rule({ conditions: nested }))).join("\n")).toMatch(/deeper/);
  });
});

describe("RuleDto — fields stay update-only and spell-checked", () => {
  it("accepts fields on an update rule", async () => {
    await expect(
      problems({ action: "update", subject: "Container", fields: ["status", "notes"] }),
    ).resolves.toEqual([]);
    await expect(
      problems({ action: "update", subject: "User", fields: ["name", "roles"] }),
    ).resolves.toEqual([]);
  });

  const refusals: Array<[string, Record<string, unknown>, RegExp]> = [
    ["fields on read", { action: "read", subject: "Container", fields: ["status"] }, /update/],
    ["fields on manage", { action: "manage", subject: "Container", fields: ["status"] }, /update/],
    [
      "fields on the all subject",
      { action: "update", subject: "all", fields: ["status"] },
      /"all"/,
    ],
    [
      "a misspelled field",
      { action: "update", subject: "Container", fields: ["despot"] },
      /"despot" is not a writable field/,
    ],
  ];

  for (const [name, input, message] of refusals) {
    it(`refuses ${name}`, async () => {
      expect((await problems(input)).join("\n")).toMatch(message);
    });
  }
});

describe("RuleDto — the pair itself", () => {
  it("refuses an unknown action or subject", async () => {
    expect((await problems({ action: "frobnicate", subject: "Container" })).join("\n")).toMatch(
      /action/,
    );
    expect((await problems({ action: "read", subject: "Booking" })).join("\n")).toMatch(/subject/);
  });

  it("stray inverted/reason keys are no longer part of the contract", async () => {
    // The DTO declares no such fields, so nothing validates them — a client still
    // sending them gets no error here and no effect either: `resolveRules` never reads
    // them and the table has no columns for them (covered in the roles spec).
    await expect(problems(rule({ inverted: true, reason: "nope" }))).resolves.toEqual([]);
  });
});
