import type { ConditionField, ConditionPlaceholder } from "@repo/access";

/**
 * The builder's model of a condition: rows of *field, comparison, value*, combined
 * one way.
 *
 * This is a view over the draft's `conditionsText`, not a second store: the builder
 * parses the text into this shape and serializes every edit straight back, so the save
 * flow, the dirty check and the API validation all keep reading the one string they
 * always read. Anything the shape below cannot carry — negation, nesting, a column the
 * registry does not list — parses to `null`, and the editor falls back to JSON for that
 * rule instead of quietly dropping what it cannot draw.
 */
export interface ConditionModel {
  /** How rows combine: every row must match (`and`) or any row may (`or`). */
  combinator: "and" | "or";
  rows: ConditionRow[];
}

/** The comparisons the builder offers — the translator's operators, spelled for a Select. */
export type RowOperator =
  | "eq"
  | "ne"
  | "in"
  | "nin"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "empty"
  | "notEmpty";

/**
 * One row. Scalar values are held as strings — they are form inputs, and a half-typed
 * number must survive a re-render — and converted to the column's JSON type only when
 * serialized. `in`/`nin` read `values`; `empty`/`notEmpty` read neither.
 */
export interface ConditionRow {
  field: string;
  operator: RowOperator;
  value: string;
  values: string[];
}

/** Spells a placeholder the way a stored condition carries it. */
export function token(name: ConditionPlaceholder): string {
  return "${" + name + "}";
}

export function fieldByName(
  fields: readonly ConditionField[],
  name: string,
): ConditionField | undefined {
  return fields.find((field) => field.name === name);
}

/**
 * The comparisons that make sense for one column — what its operator Select offers.
 *
 * Set membership is only offered where the values are a closed list the UI can draw as
 * choices; a free-typed "any of" would reintroduce exactly the typo problem the builder
 * exists to remove. Ranges follow the translator: numeric and date columns only.
 */
export function operatorsFor(field: ConditionField): RowOperator[] {
  const operators: RowOperator[] = ["eq", "ne"];

  if (field.kind === "enum" || (field.kind === "number" && field.options)) {
    operators.push("in", "nin");
  }
  if (field.kind === "number" || field.kind === "date") {
    operators.push("gt", "gte", "lt", "lte");
  }
  if (field.nullable) {
    operators.push("empty", "notEmpty");
  }

  return operators;
}

/** A fresh row for a just-picked field, complete enough to serialize immediately. */
export function defaultRow(field: ConditionField): ConditionRow {
  return { field: field.name, operator: "eq", value: defaultValue(field), values: [] };
}

export function defaultValue(field: ConditionField): string {
  switch (field.kind) {
    case "enum":
      return field.values[0] ?? "";
    case "boolean":
      return "true";
    case "user":
      // The value the field exists for: "the signed-in user" beats a pasted uuid.
      return token("user.id");
    case "number":
      return field.options?.[0] !== undefined ? String(field.options[0]) : "";
    default:
      return "";
  }
}

/** Why a row cannot be saved as it stands, or `null` when it can. Keys into messages. */
export function rowProblem(row: ConditionRow, field: ConditionField): "value" | "values" | null {
  if (row.operator === "empty" || row.operator === "notEmpty") return null;
  if (row.operator === "in" || row.operator === "nin") {
    return row.values.length === 0 ? "values" : null;
  }
  if (field.kind === "number") {
    return row.value.trim() !== "" && Number.isFinite(Number(row.value)) ? null : "value";
  }
  if (field.kind === "date" || field.kind === "user") {
    return row.value.trim() === "" ? "value" : null;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A form value as the column's JSON type. An unparseable number is passed through as
 * the string it is: the JSON stays well-formed, the row is already flagged by
 * `rowProblem`, and if saved anyway the API's own message names the field — quietly
 * coercing it to `0` would save a rule nobody wrote.
 */
function toScalar(field: ConditionField, raw: string): string | number | boolean {
  switch (field.kind) {
    case "number": {
      const parsed = Number(raw);
      return raw.trim() !== "" && Number.isFinite(parsed) ? parsed : raw;
    }
    case "boolean":
      return raw === "true";
    default:
      return raw;
  }
}

/** The inverse: a stored JSON value as input text — or `null` if it is not this kind. */
function fromScalar(field: ConditionField, value: unknown): string | null {
  switch (field.kind) {
    case "number":
      return typeof value === "number" ? String(value) : null;
    case "boolean":
      return typeof value === "boolean" ? String(value) : null;
    case "enum":
      return typeof value === "string" && field.values.includes(value) ? value : null;
    default:
      return typeof value === "string" ? value : null;
  }
}

function rowToNode(row: ConditionRow, field: ConditionField): Record<string, unknown> {
  switch (row.operator) {
    case "eq":
      return { [row.field]: toScalar(field, row.value) };
    case "empty":
      return { [row.field]: null };
    case "notEmpty":
      return { [row.field]: { $ne: null } };
    case "in":
    case "nin":
      return { [row.field]: { ["$" + row.operator]: row.values.map((v) => toScalar(field, v)) } };
    default:
      return { [row.field]: { ["$" + row.operator]: toScalar(field, row.value) } };
  }
}

/**
 * The model as condition JSON — pretty-printed, matching how saved rules are seeded
 * back into the editor.
 *
 * A single AND of distinct fields folds into one plain object, which is the form the
 * examples use and the easiest to read back; the explicit `$and` only appears when the
 * same field is compared twice, where merging keys would collide.
 */
export function serializeConditions(
  model: ConditionModel,
  fields: readonly ConditionField[],
): string {
  if (model.rows.length === 0) return "";

  const nodes = model.rows.map((row) => {
    const field = fieldByName(fields, row.field) ?? { name: row.field, kind: "text" as const };
    return rowToNode(row, field);
  });

  const pretty = (value: unknown) => JSON.stringify(value, null, 2);

  if (nodes.length === 1) return pretty(nodes[0]);
  if (model.combinator === "or") return pretty({ $or: nodes });

  const names = model.rows.map((row) => row.field);
  if (new Set(names).size === names.length) return pretty(Object.assign({}, ...nodes));
  return pretty({ $and: nodes });
}

/**
 * Condition JSON as a model, or `null` when the builder cannot draw it faithfully.
 *
 * `null` is a fallback, not a failure: the rule keeps working, the editor shows the
 * JSON instead. What earns it: text that does not parse, operators outside the
 * builder's set, a field the registry does not list, a value that is not the field's
 * kind, mixing `$or` with plain keys, or an `$or` branch that is itself a conjunction
 * — each would have to be redrawn as something subtly different, and a builder that
 * *almost* shows the stored rule is worse than one that declines.
 */
export function parseConditions(
  text: string,
  fields: readonly ConditionField[],
): ConditionModel | null {
  const trimmed = text.trim();
  if (!trimmed) return { combinator: "and", rows: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;

  const keys = Object.keys(parsed);

  if (keys.length === 1 && (keys[0] === "$or" || keys[0] === "$and")) {
    const combinator = keys[0] === "$or" ? ("or" as const) : ("and" as const);
    const list = parsed[keys[0] as "$or" | "$and"];
    if (!Array.isArray(list) || list.length === 0) return null;

    const rows: ConditionRow[] = [];
    for (const entry of list) {
      if (!isPlainObject(entry)) return null;
      const entryRows = objectToRows(entry, fields);
      if (!entryRows) return null;
      // Inside `$or`, one branch must stay one row: a branch of two comparisons is a
      // conjunction the flat list would silently turn into two alternatives.
      if (combinator === "or" && entryRows.length !== 1) return null;
      rows.push(...entryRows);
    }
    return { combinator, rows };
  }

  const rows = objectToRows(parsed, fields);
  return rows ? { combinator: "and", rows } : null;
}

/** `{ field: …, field: … }` as rows, ANDed — or `null` when any entry is undrawable. */
function objectToRows(
  node: Record<string, unknown>,
  fields: readonly ConditionField[],
): ConditionRow[] | null {
  const rows: ConditionRow[] = [];

  for (const [key, value] of Object.entries(node)) {
    const field = fieldByName(fields, key);
    if (!field) return null;

    if (value === null) {
      if (!operatorsFor(field).includes("empty")) return null;
      rows.push({ field: key, operator: "empty", value: "", values: [] });
      continue;
    }

    if (isPlainObject(value)) {
      const entries = Object.entries(value);
      if (entries.length === 0) return null;
      for (const [operator, operand] of entries) {
        const row = operatorToRow(field, operator, operand);
        if (!row) return null;
        rows.push(row);
      }
      continue;
    }

    const raw = fromScalar(field, value);
    if (raw === null) return null;
    rows.push({ field: key, operator: "eq", value: raw, values: [] });
  }

  return rows.length > 0 ? rows : null;
}

function operatorToRow(field: ConditionField, operator: string, operand: unknown): ConditionRow | null {
  const allowed = operatorsFor(field);
  const make = (op: RowOperator, value = "", values: string[] = []): ConditionRow | null =>
    allowed.includes(op) ? { field: field.name, operator: op, value, values } : null;

  switch (operator) {
    case "$eq": {
      if (operand === null) return make("empty");
      const raw = fromScalar(field, operand);
      return raw === null ? null : make("eq", raw);
    }
    case "$ne": {
      if (operand === null) return make("notEmpty");
      const raw = fromScalar(field, operand);
      return raw === null ? null : make("ne", raw);
    }
    case "$in":
    case "$nin": {
      if (!Array.isArray(operand)) return null;
      const values: string[] = [];
      for (const entry of operand) {
        const raw = fromScalar(field, entry);
        if (raw === null) return null;
        values.push(raw);
      }
      return make(operator === "$in" ? "in" : "nin", "", values);
    }
    case "$gt":
    case "$gte":
    case "$lt":
    case "$lte": {
      const raw = fromScalar(field, operand);
      return raw === null ? null : make(operator.slice(1) as RowOperator, raw);
    }
    default:
      return null;
  }
}
