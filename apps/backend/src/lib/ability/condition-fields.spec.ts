import { describe, expect, it } from "vitest";

import type { AppResourceSubject, ConditionField } from "@repo/access";
import { CONDITION_FIELDS } from "@repo/access";

import { assertConditionsTranslatable } from "./ability-where";
import { CONDITION_COLUMNS } from "./condition-columns";

/**
 * A value of the exact shape the kind promises, for compiling a probe condition.
 *
 * For an integer column the probe is deliberately a whole number and a *second* probe
 * below asserts the fractional one is refused — that is what proves the `integer` flag
 * right rather than merely harmless.
 */
function representative(field: ConditionField): unknown {
  switch (field.kind) {
    case "text":
      return "probe";
    case "enum":
      return field.values[0];
    case "number":
      return field.integer ? 21 : 21.5;
    case "date":
      return "2026-01-01";
    case "boolean":
      return true;
    case "user":
      return "00000000-0000-0000-0000-000000000000";
  }
}

/**
 * `CONDITION_FIELDS` is the catalog the console's condition builder draws choices from,
 * and every claim it makes — the column exists, its type, its nullability, its value
 * list — must be one the translator agrees with, because the builder's output is saved
 * through `IsRuleConditions`, which compiles it against these same columns. A schema
 * change that falsifies an entry fails here, not in an operator's browser.
 */
describe("CONDITION_FIELDS matches the schema it will be compiled against", () => {
  const subjects = Object.entries(CONDITION_FIELDS) as Array<
    [AppResourceSubject, readonly ConditionField[]]
  >;

  for (const [subject, fields] of subjects) {
    describe(subject, () => {
      for (const field of fields) {
        it(`${field.name} (${field.kind}) compiles and describes its column`, () => {
          const columns = CONDITION_COLUMNS[subject];
          const column = columns[field.name];

          expect(column, `"${field.name}" is not a column of ${subject}`).toBeDefined();

          expect(() =>
            assertConditionsTranslatable({ [field.name]: representative(field) }, columns),
          ).not.toThrow();

          expect(!column!.notNull, `"${field.name}" nullability disagrees with the schema`).toBe(
            field.nullable ?? false,
          );

          switch (field.kind) {
            case "enum":
              expect(column!.enumValues).toEqual([...field.values]);
              break;
            case "user":
              expect(column!.columnType).toBe("PgUUID");
              break;
            case "date":
              expect(column!.columnType).toBe("PgDateString");
              break;
            case "boolean":
              expect(column!.dataType).toBe("boolean");
              break;
            case "number":
              expect(column!.dataType).toBe("number");
              if (field.integer) {
                expect(() => assertConditionsTranslatable({ [field.name]: 21.5 }, columns)).toThrow(
                  /whole number/,
                );
              }
              break;
            case "text":
              expect(column!.dataType).toBe("string");
              expect(column!.columnType).not.toBe("PgUUID");
              expect(column!.enumValues ?? []).toEqual([]);
              break;
          }
        });
      }
    });
  }
});
