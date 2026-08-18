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
 * Compiles what a caller's rules permit into a WHERE clause, so a list query does not
 * have to fetch rows only to throw them away.
 *
 * ## The one invariant
 *
 * For every row: **`conditions` match ⟹ this predicate matches.** The predicate may admit
 * rows the rules forbid; it must never exclude one the rules allow.
 *
 * That asymmetry is the whole design. The rules are MongoDB-style queries evaluated by
 * `@ucast/mongo2js`, and a second evaluator written against Postgres will differ from it
 * somewhere — three-valued logic over NULL, JS coercing `null` to `0` in a comparison, a
 * regex dialect. If the two are allowed to differ in *either* direction, the difference is
 * a security bug in the direction nobody notices. Constrained to differ in one, it is only
 * ever wasted I/O, because the caller's ability is still applied per row afterwards and has
 * the final say. So every branch below either translates a construct exactly or gives up on
 * it and widens: an untranslatable clause is dropped from an AND, an untranslatable branch
 * discards the whole OR, and an untranslatable rule abandons the push-down entirely by
 * returning `undefined`.
 *
 * Widening is also why inverted rules are skipped. A deny would have to be negated, and
 * negating a *widened* translation narrows the result — the one direction that can hide a
 * row — so denies are left to the per-row filter. Their cost is that `total` over-counts
 * for a caller whose access is shaped by a deny; conditional allows, which is what
 * "only the boxes assigned to you" is, pay nothing.
 *
 * Returns `undefined` when nothing can be narrowed, which is exactly what Drizzle's `and()`
 * ignores, so a call site reads as one more filter among the others.
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
    if (rule.inverted) continue;

    // An unconditional grant admits every row, and `OR` with everything is everything.
    if (!rule.conditions) return undefined;

    const branch = translate(rule.conditions as Record<string, unknown>, columns);
    if (!branch) return undefined;

    branches.push(branch);
  }

  // No allow rule at all. The route guard refuses before this point, so this is a
  // belt-and-braces `WHERE false` rather than a case a request can reach.
  if (branches.length === 0) return sql`false`;

  return or(...branches);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One condition object: its keys are ANDed, as in MongoDB. */
function translate(
  node: Record<string, unknown>,
  columns: Record<string, Column>,
): SQL | undefined {
  const parts: SQL[] = [];

  for (const [key, value] of Object.entries(node)) {
    const part =
      key === "$and" || key === "$or"
        ? translateGroup(value, columns, key)
        : key.startsWith("$")
          ? // `$nor`, `$not`, and anything else logical. Negation is the operation that
            // cannot be widened, so it is not attempted.
            undefined
          : translateField(columns[key], value);

    // Dropping a clause from an AND admits more rows, which the invariant allows.
    if (part) parts.push(part);
  }

  return parts.length === 0 ? undefined : and(...parts);
}

function translateGroup(
  value: unknown,
  columns: Record<string, Column>,
  operator: "$and" | "$or",
): SQL | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const parts: SQL[] = [];

  for (const item of value) {
    const part = isPlainObject(item) ? translate(item, columns) : undefined;

    if (!part) {
      // Dropping a branch of an OR *removes* rows, so an untranslatable branch takes the
      // whole disjunction with it. In an AND it is just one fewer restriction.
      if (operator === "$or") return undefined;
      continue;
    }

    parts.push(part);
  }

  if (parts.length === 0) return undefined;

  return operator === "$and" ? and(...parts) : or(...parts);
}

function translateField(column: Column | undefined, value: unknown): SQL | undefined {
  // A condition naming something that is not a column of this table — a joined alias, a
  // dotted path, a typo — cannot be narrowed here.
  if (!column) return undefined;

  if (value === null) return isNull(column);

  if (isPlainObject(value)) return translateOperators(column, value);

  // An array value is a deep-equality match against an array column; not attempted.
  if (Array.isArray(value)) return undefined;

  return bindable(column, value) ? eq(column, cast(value)) : undefined;
}

function translateOperators(column: Column, node: Record<string, unknown>): SQL | undefined {
  const parts: SQL[] = [];

  for (const [operator, operand] of Object.entries(node)) {
    const part = translateOperator(column, operator, operand);
    if (part) parts.push(part);
  }

  return parts.length === 0 ? undefined : and(...parts);
}

function translateOperator(column: Column, operator: string, operand: unknown): SQL | undefined {
  switch (operator) {
    case "$eq":
      if (operand === null) return isNull(column);
      return bindable(column, operand) ? eq(column, cast(operand)) : undefined;

    case "$ne":
      if (operand === null) return isNotNull(column);
      if (!bindable(column, operand)) return undefined;
      // `col <> $1` is unknown — and therefore false — where the column is NULL, while the
      // rule matches such a row. Without the `IS NULL` arm this would hide it.
      return or(ne(column, cast(operand)), isNull(column));

    case "$in":
    case "$nin": {
      if (!Array.isArray(operand)) return undefined;

      const values = operand.filter((entry) => entry !== null);
      if (values.some((entry) => !bindable(column, entry))) return undefined;

      // NULL is not a value SQL's `IN` can compare, so it moves to its own arm. Drizzle
      // renders an empty list as a literal `false`/`true`, which is the right answer for
      // both operators.
      if (operator === "$in") {
        const included = inArray(column, values.map(cast));
        return values.length === operand.length ? included : or(included, isNull(column));
      }

      return or(notInArray(column, values.map(cast)), isNull(column));
    }

    case "$gt":
    case "$gte":
    case "$lt":
    case "$lte": {
      if (operand === null || !bindable(column, operand)) return undefined;

      const comparison = { $gt: gt, $gte: gte, $lt: lt, $lte: lte }[operator](
        column,
        cast(operand),
      );

      // JS relational operators coerce a missing value to `0`, so `{ tareWeightKg: { $lte: 5 } }`
      // matches a row whose tare is NULL while SQL's comparison does not. Where that is the
      // case the NULL rows are added back rather than silently dropped.
      return matchesNull(operator, operand) ? or(comparison, isNull(column)) : comparison;
    }

    // `$exists` is deliberately absent: every column of a row object is present, so it
    // means something different in memory than `IS NOT NULL` does here. `$regex`, `$all`,
    // `$size` and `$elemMatch` have no faithful one-line equivalent.
    default:
      return undefined;
  }
}

/** Whether the comparison would also hold for a missing value, under JS coercion. */
function matchesNull(operator: string, operand: unknown): boolean {
  // Relational operators convert both sides to numbers unless both are strings, and the
  // left side here is always `null` — so this reproduces what the in-memory evaluator does.
  const missing = null as unknown as number;
  const right = operand as number;

  switch (operator) {
    case "$gt":
      return missing > right;
    case "$gte":
      return missing >= right;
    case "$lt":
      return missing < right;
    case "$lte":
      return missing <= right;
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

/**
 * Whether this value can be compared against this column without Postgres raising.
 *
 * A rule holding the wrong type for a column is a real possibility — conditions are JSON
 * an operator wrote — and in memory it simply matches nothing. Pushed into SQL unchecked it
 * would be `invalid input syntax for type uuid` on the whole list endpoint, so a value that
 * would not survive the comparison is refused translation instead, leaving the rule to be
 * evaluated in memory exactly as before.
 *
 * Enum columns are checked against their own labels for the same reason: Postgres rejects a
 * literal that is not a member rather than returning no rows.
 */
function bindable(column: Column, value: unknown): boolean {
  switch (column.dataType) {
    case "string": {
      if (typeof value !== "string") return false;
      if (column.enumValues?.length) return column.enumValues.includes(value);
      if (column.columnType === "PgUUID") return UUID_PATTERN.test(value);
      if (column.columnType === "PgDateString") return DATE_PATTERN.test(value);
      return true;
    }

    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      return INTEGER_COLUMNS.has(column.columnType) ? Number.isInteger(value) : true;
    }

    case "boolean":
      return typeof value === "boolean";

    // `date` columns want a `Date`, and JSON conditions cannot hold one — a string compared
    // against a timestamp column matches nothing in memory either. `json`, `array`,
    // `bigint`, `buffer` and custom types are left alone.
    default:
      return false;
  }
}

/**
 * Hands a checked value to Drizzle's comparison helpers.
 *
 * They are typed against the column's inferred TypeScript type, which a value read out of a
 * JSON condition cannot be statically. `bindable` is the check that makes this sound, so
 * the two always travel together.
 */
function cast(value: unknown): never {
  return value as never;
}
