import { DELIVERY_STATUSES } from "@repo/goods-in";
import {
  CONTAINER_CONDITIONS,
  CONTAINER_SIZES_FT,
  CONTAINER_STATUSES,
  CONTAINER_TYPES,
} from "@repo/shipping";

import type { AppResourceSubject } from "./ability";
import type { ConditionPlaceholder } from "./rules";

/**
 * What one column offers a condition editor: which input to draw, which comparisons
 * make sense, and which values are legal.
 *
 * `kind` speaks the console's language, not the database's: `user` is a uuid column
 * that references an account (so "the signed-in user" is a sensible value), and `enum`
 * carries its own closed value list so an editor never has to free-type a status.
 */
interface ConditionFieldBase {
  /** The column's TypeScript property name — the key a stored condition uses. */
  name: string;
  /**
   * Whether the column can hold NULL — what an "is empty" comparison compiles to.
   * Offering it on a NOT NULL column would draw a choice that can never match.
   */
  nullable?: boolean;
}

export type ConditionField = ConditionFieldBase &
  (
    | {
        kind: "text";
        /** The placeholder that resolves to a value of this column's shape, if one does. */
        placeholder?: ConditionPlaceholder;
      }
    | { kind: "enum"; values: readonly string[] }
    | {
        kind: "number";
        /** True for integer columns, which refuse a fractional value at write time. */
        integer?: boolean;
        /** The sensible values, where the column has few — drawn as choices, not typed. */
        options?: readonly number[];
      }
    | { kind: "date" }
    | { kind: "boolean" }
    | { kind: "user" }
  );

/**
 * The columns a condition editor offers, per subject — the clickable subset of what the
 * API accepts.
 *
 * The API validates a condition by compiling it against the subject's *actual* table
 * (see the backend's `CONDITION_COLUMNS`), so this registry is deliberately not the
 * enforcement boundary: it is the catalog a form builds choices from, curated down to
 * the columns a permission policy plausibly turns on. Columns that are technically
 * matchable but meaningless as policy (`notes`, `isoTypeCode`) or unspeakable
 * (`passwordHash`) are left out; a hand-written JSON condition may still use them.
 *
 * Like `WRITABLE_FIELDS`, it lives in this package so both sides read one list — and
 * because it describes real columns, the backend pins it to the schema with a test
 * (`condition-fields.spec.ts`): every entry must compile through the same translator
 * that validates stored rules, with the type, nullability and value list it declares.
 * A schema change that invalidates an entry fails there, not in an operator's browser.
 *
 * There is no `all` entry for the same reason `CONDITION_COLUMNS` has none: the API
 * refuses conditions on an `all` rule outright.
 */
export const CONDITION_FIELDS: Record<AppResourceSubject, readonly ConditionField[]> = {
  User: [
    // "The account itself" — `{ id: "${user.id}" }` is how "their own profile" is spelled.
    { name: "id", kind: "user" },
    { name: "email", kind: "text", placeholder: "user.email" },
    { name: "name", kind: "text", nullable: true },
  ],
  Role: [
    { name: "key", kind: "text" },
    { name: "name", kind: "text" },
    { name: "isSystem", kind: "boolean" },
  ],
  Container: [
    { name: "assignedToId", kind: "user", nullable: true },
    { name: "status", kind: "enum", values: CONTAINER_STATUSES },
    { name: "type", kind: "enum", values: CONTAINER_TYPES },
    { name: "condition", kind: "enum", values: CONTAINER_CONDITIONS },
    { name: "sizeFt", kind: "number", integer: true, options: CONTAINER_SIZES_FT },
    { name: "containerNumber", kind: "text" },
    { name: "operator", kind: "text", nullable: true },
    { name: "unlocode", kind: "text", nullable: true },
    { name: "depot", kind: "text", nullable: true },
    { name: "tareWeightKg", kind: "number", integer: true },
    { name: "maxGrossWeightKg", kind: "number", integer: true },
    { name: "manufacturedOn", kind: "date", nullable: true },
    { name: "nextInspectionOn", kind: "date", nullable: true },
  ],
  Supplier: [
    { name: "code", kind: "text" },
    { name: "name", kind: "text" },
  ],
  // `supplierId` is deliberately not offered: it is a uuid that references a supplier,
  // not an account, so neither the `user` kind (which draws an account picker) nor the
  // `text` kind (which the schema pin refuses for uuid columns) describes it. A
  // hand-written JSON condition on it still validates and compiles.
  Delivery: [
    { name: "status", kind: "enum", values: DELIVERY_STATUSES },
    { name: "deliveryNo", kind: "number", integer: true },
    { name: "deliveredOn", kind: "date" },
    { name: "lotNo", kind: "text", nullable: true },
    { name: "signedById", kind: "user", nullable: true },
  ],
};
