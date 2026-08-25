import type { Column, SQL } from "drizzle-orm";
import {
  and,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import type { AppAbility, AppAction, AppResourceSubject } from "@repo/access";

/**
 * A rule reached the translator that it cannot compile into SQL exactly.
 *
 * Deliberately not a Nest exception: this is not a client mistake, it is an invariant
 * violation. Rule writes are validated with this same translator (see `IsRuleConditions`),
 * so a stored rule that throws here means the validation and the translator have been
 * allowed to drift — a bug to fix, not a request to refuse politely. Nest turns it into
 * a 500, which is the correct volume.
 */
export class UntranslatableRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UntranslatableRuleError";
  }
}

/**
 * Compiles what a caller's rules permit into a WHERE clause, so a list query fetches
 * exactly the rows the caller may see — `total` counts them, and a page comes back full.
 *
 * ## The one invariant
 *
 * For every row: **`conditions` match ⟺ this predicate matches.** Exactly — or this
 * function throws.
 *
 * The rules are MongoDB-style queries evaluated by `@ucast/mongo2js`, and a second
 * evaluator written against Postgres could differ from it somewhere — three-valued logic
 * over NULL, JS coercing `null` to `0` in a comparison, a regex dialect. This translator
 * therefore only admits constructs it can mirror exactly (the NULL arms below are those
 * mirrors), and *throws* on everything else rather than approximating in either
 * direction: an approximation that admits too much shows rows the rules forbid, and one
 * that admits too little hides rows silently. Both are worse than a loud error.
 *
 * The throw is unreachable for rules written through the API: `IsRuleConditions`
 * validates every stored condition by running it through this same translation (against
 * the subject's real columns, placeholders substituted with representative values), so
 * anything storable compiles. What the throw guards is drift — an operator added to the
 * validator but not here, a column type nobody taught `bindProblem`, a rule row edited
 * around the API. Those surface as a 500 on the first affected request instead of as a
 * silently wrong list.
 *
 * Deny (`inverted`) rules do not exist in this system, and that is load-bearing here:
 * translating a deny would mean negating a predicate, and SQL negation over NULLs does
 * not mirror the in-memory evaluator. Rules are ORed grants, nothing else.
 *
 * Returns `undefined` only when the rules genuinely admit every row (an unconditional
 * grant), which is exactly what Drizzle's `and()` ignores, so a call site reads as one
 * more filter among the others.
 */
export function abilityWhere(
  ability: AppAbility,
  action: AppAction,
  subject: AppResourceSubject,
  columns: Record<string, Column>,
): SQL | undefined {
  const branches: SQL[] = [];

  // `possibleRulesFor` is the indexed lookup the ability uses itself, so `manage`/`all`
  // wildcards and rules inherited from another subject are already folded in — asking the
  // rule list directly would miss an admin's `manage all` and narrow a query that should
  // not be narrowed.
  for (const rule of ability.possibleRulesFor(action, subject)) {
    // The deny feature was removed; the schema cannot store one and `AppRule` cannot
    // carry one. A deny reaching this point is stale data or a stale build, and
    // translating around it would silently widen access.
    if (rule.inverted) {
      throw new UntranslatableRuleError(
        `an inverted rule for "${action} ${subject}" reached the translator — deny rules are not supported`,
      );
    }

    // An unconditional grant admits every row, and `OR` with everything is everything.
    if (!rule.conditions) return undefined;

    branches.push(translate(rule.conditions as Record<string, unknown>, columns));
  }

  // No allow rule at all. The route guard refuses before this point, so this is a
  // belt-and-braces `WHERE false` rather than a case a request can reach.
  if (branches.length === 0) return sql`false`;

  return or(...branches);
}

/**
 * Validates that a condition object compiles, for the rule DTO.
 *
 * This *is* the write-time check: the API refuses to store any condition this function
 * throws on, which is what makes the runtime throw in `abilityWhere` unreachable for
 * rules written through the API. One translator serving as both validator and compiler
 * is the whole design — two implementations would drift, and the drift would surface as
 * a 500 on a list endpoint months after the rule was saved.
 */
export function assertConditionsTranslatable(
  conditions: Record<string, unknown>,
  columns: Record<string, Column>,
): void {
  translate(conditions, columns);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One condition object: its keys are ANDed, as in MongoDB. */
function translate(node: Record<string, unknown>, columns: Record<string, Column>): SQL {
  const parts: SQL[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (key === "$and" || key === "$or") {
      parts.push(translateGroup(value, columns, key));
    } else if (key.startsWith("$")) {
      // `$nor`, `$not`, and anything else logical. Negation cannot be translated exactly
      // — SQL's three-valued NOT does not mirror the in-memory evaluator over NULLs — so
      // it is refused outright rather than approximated.
      throw new UntranslatableRuleError(`the "${key}" operator is not supported in conditions`);
    } else {
      parts.push(translateField(key, columns[key], value));
    }
  }

  // `{}` matches every row in memory, but an empty branch inside an `$or` would have to
  // become a literal TRUE — a rule that grants everything while looking like a narrowing.
  // The DTO collapses a top-level `{}` to "no conditions" before it gets here, so an
  // empty object at this point is always a mistake worth naming.
  if (parts.length === 0) {
    throw new UntranslatableRuleError("an empty condition object matches everything — omit it");
  }

  return and(...parts) as SQL;
}

function translateGroup(
  value: unknown,
  columns: Record<string, Column>,
  operator: "$and" | "$or",
): SQL {
  if (!Array.isArray(value) || value.length === 0) {
    throw new UntranslatableRuleError(`"${operator}" expects a non-empty array of conditions`);
  }

  const parts = value.map((item) => {
    if (!isPlainObject(item)) {
      throw new UntranslatableRuleError(`every entry of "${operator}" must be a condition object`);
    }
    return translate(item, columns);
  });

  return (operator === "$and" ? and(...parts) : or(...parts)) as SQL;
}

function translateField(key: string, column: Column | undefined, value: unknown): SQL {
  // A condition naming something that is not a column of this table — a joined alias, a
  // dotted path, a typo — cannot be evaluated by the database at all.
  if (!column) {
    throw new UntranslatableRuleError(`"${key}" is not a column conditions can match on`);
  }

  if (value === null) return isNull(column);

  if (isPlainObject(value)) return translateOperators(key, column, value);

  // An array value is a deep-equality match against an array column; not supported.
  if (Array.isArray(value)) {
    throw new UntranslatableRuleError(
      `"${key}": comparing against an array is not supported — use "$in"`,
    );
  }

  assertBindable(key, column, value);
  return eq(column, cast(value));
}

function translateOperators(key: string, column: Column, node: Record<string, unknown>): SQL {
  const entries = Object.entries(node);

  if (entries.length === 0) {
    throw new UntranslatableRuleError(`"${key}": an empty operator object matches nothing`);
  }

  const parts = entries.map(([operator, operand]) =>
    translateOperator(key, column, operator, operand),
  );

  return and(...parts) as SQL;
}

function translateOperator(key: string, column: Column, operator: string, operand: unknown): SQL {
  switch (operator) {
    case "$eq":
      if (operand === null) return isNull(column);
      assertBindable(key, column, operand);
      return eq(column, cast(operand));

    case "$ne":
      if (operand === null) return isNotNull(column);
      assertBindable(key, column, operand);
      // `col <> $1` is unknown — and therefore false — where the column is NULL, while the
      // rule matches such a row. Without the `IS NULL` arm this would hide it.
      return or(ne(column, cast(operand)), isNull(column)) as SQL;

    case "$in":
    case "$nin": {
      if (!Array.isArray(operand)) {
        throw new UntranslatableRuleError(`"${key}": "${operator}" expects an array of values`);
      }

      const values = operand.filter((entry) => entry !== null);
      for (const entry of values) assertBindable(key, column, entry);

      // NULL is not a value SQL's `IN` can compare, so it moves to its own arm. Drizzle
      // renders an empty list as a literal `false`/`true`, which is the right answer for
      // both operators.
      if (operator === "$in") {
        const included = inArray(column, values.map(cast));
        return values.length === operand.length ? included : (or(included, isNull(column)) as SQL);
      }

      return or(notInArray(column, values.map(cast)), isNull(column)) as SQL;
    }

    case "$gt":
    case "$gte":
    case "$lt":
    case "$lte": {
      if (operand === null) {
        throw new UntranslatableRuleError(`"${key}": "${operator}" cannot compare against null`);
      }

      // Numbers order the same way in JS and Postgres, and ISO `YYYY-MM-DD` strings order
      // chronologically in both. Free text does not: JS compares UTF-16 code units while
      // Postgres compares by collation, and the two disagree about something as ordinary
      // as case — so a range over any other column type has no exact translation.
      if (column.dataType !== "number" && column.columnType !== "PgDateString") {
        throw new UntranslatableRuleError(
          `"${key}": range operators only apply to numeric and date columns`,
        );
      }

      assertBindable(key, column, operand);

      const comparison = { $gt: gt, $gte: gte, $lt: lt, $lte: lte }[operator](
        column,
        cast(operand),
      );

      // JS relational operators coerce a missing value to `0`, so `{ tareWeightKg: { $lte: 5 } }`
      // matches a row whose tare is NULL while SQL's comparison does not. Where that is the
      // case the NULL rows are added in, so the two evaluators agree exactly.
      return matchesNull(operator, operand) ? (or(comparison, isNull(column)) as SQL) : comparison;
    }

    // `$exists` means something different in memory (every column of a row object is
    // present) than `IS NOT NULL` does here; `$regex` is a different dialect in JS and
    // Postgres; `$all`, `$size` and `$elemMatch` have no exact one-line equivalent.
    // Nothing untranslatable is approximated.
    default:
      throw new UntranslatableRuleError(
        `the "${operator}" operator has no exact SQL translation and is not supported`,
      );
  }
}

/** Whether the in-memory evaluator's range comparison holds for a missing (NULL) value. */
function matchesNull(operator: string, operand: unknown): boolean {
  // `@ucast/js` does not apply JS's relational operators directly — it orders the sides
  // with `compare(a, b) = a === b ? 0 : a > b ? 1 : -1` and derives all four operators
  // from that. The difference bites exactly here: JS says `null >= 0` is true, but
  // `compare(null, 0)` is -1 (neither `null === 0` nor `null > 0`), so the evaluator
  // says no. A NULL field is `1` against operands `null > x` holds for (negative
  // numbers, via coercion) and `-1` against everything else, strings included. This
  // reproduces that ordering — raw JS coercion here once made SQL disagree with the
  // evaluator at operand 0, which the exactness tests caught.
  const missing = null as unknown as number;
  const comparison = missing > (operand as number) ? 1 : -1;

  switch (operator) {
    case "$gt":
    case "$gte":
      return comparison === 1;
    case "$lt":
    case "$lte":
      return comparison === -1;
    default:
      return false;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const INTEGER_COLUMNS = new Set([
  "PgSmallInt",
  "PgInteger",
  "PgBigInt53",
  "PgBigInt64",
  "PgSerial",
  "PgSmallSerial",
  "PgBigSerial53",
  "PgBigSerial64",
]);

function assertBindable(key: string, column: Column, value: unknown): void {
  const problem = bindProblem(column, value);
  if (problem) throw new UntranslatableRuleError(`"${key}": ${problem}`);
}

/**
 * Why this value cannot be compared against this column, or `null` when it can.
 *
 * A rule holding the wrong type for a column is a real possibility — conditions are JSON
 * an operator wrote. In memory the comparison simply matches nothing, but pushed into SQL
 * unchecked it would be `invalid input syntax for type uuid` on the whole list endpoint.
 * The check runs at write time through `assertConditionsTranslatable`, so the message is
 * what the operator sees under the form field that caused it.
 *
 * Enum columns are checked against their own labels for the same reason: Postgres rejects
 * a literal that is not a member rather than returning no rows.
 */
function bindProblem(column: Column, value: unknown): string | null {
  switch (column.dataType) {
    case "string": {
      if (typeof value !== "string") return "expects a text value";
      if (column.enumValues?.length) {
        return column.enumValues.includes(value)
          ? null
          : `must be one of: ${column.enumValues.join(", ")}`;
      }
      if (column.columnType === "PgUUID") {
        return UUID_PATTERN.test(value) ? null : "must be a UUID";
      }
      if (column.columnType === "PgDateString") {
        return DATE_PATTERN.test(value) ? null : "must be a YYYY-MM-DD date";
      }
      return null;
    }

    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return "expects a number";
      return INTEGER_COLUMNS.has(column.columnType) && !Number.isInteger(value)
        ? "expects a whole number"
        : null;
    }

    case "boolean":
      return typeof value === "boolean" ? null : "expects true or false";

    // `date` columns want a `Date`, and JSON conditions cannot hold one; `json`, `array`,
    // `bigint`, `buffer` and custom types have no JSON literal that compares exactly.
    default:
      return "this column cannot be used in conditions";
  }
}

/**
 * Hands a checked value to Drizzle's comparison helpers.
 *
 * They are typed against the column's inferred TypeScript type, which a value read out of
 * a JSON condition cannot be statically. `assertBindable` is the check that makes this
 * sound, so the two always travel together.
 */
function cast(value: unknown): never {
  return value as never;
}
