import type { AppAbility, AppResourceSubject, AppSubjectInstance } from "./ability";
import type { AppAction } from "./vocabulary";

/**
 * The one action a rule's `fields` list applies to.
 *
 * `fields` narrows a rule to a set of columns, and this codebase enforces that on
 * writes only: a PATCH names the columns it touches, so refusing the ones a rule does
 * not cover is exact and the refusal is legible. Reads are deliberately left alone —
 * filtering columns out of a response would make the console render rows with holes in
 * them, and `conditions` already covers "which rows may be read", which is what read
 * restrictions actually want.
 *
 * Because the other actions are not field-checked, the API refuses to *store* `fields`
 * on them: a rule that appears to restrict something and does not is the failure mode
 * this whole package is arranged to avoid. `manage` is refused for the same reason —
 * it covers `read` and `delete` too, so its fields would only be half honoured.
 */
export const FIELD_SCOPED_ACTION: AppAction = "update";

/**
 * The field names a rule may name, per subject.
 *
 * These are wire names — the keys of the PATCH body, not database columns — because
 * that is what enforcement compares against and what an operator sees in the console.
 * Each API module asserts at compile time that its update DTO's keys all appear here
 * (see `WritableKeys`), so a column added to a DTO without being listed does not build.
 *
 * Two entries are not body keys at all: `User.roles` and `Role.permissions`. Those are
 * replaced through their own endpoints (`PUT /users/:id/roles`, `PUT /roles/:id/permissions`)
 * because each takes a complete set, but they are still *fields of the resource* as far
 * as authorization is concerned — and they are the two that hand out privilege, so being
 * able to withhold them while granting the rest is the point of field-level control:
 * `update Role` limited to `["name", "description"]` is "may rename a role, may not
 * change what it grants".
 */
export const WRITABLE_FIELDS = {
  User: ["email", "password", "name", "roles"],
  Role: ["key", "name", "description", "permissions"],
  Container: [
    "containerNumber",
    "type",
    "sizeFt",
    "tareWeightKg",
    "maxGrossWeightKg",
    "status",
    "condition",
    "isoTypeCode",
    "cubicCapacityM3",
    "operator",
    "unlocode",
    "depot",
    "manufacturedOn",
    "nextInspectionOn",
    "reeferSetpointC",
    "notes",
    "assignedToId",
  ],
} as const satisfies Record<AppResourceSubject, readonly string[]>;

/** Every field name a rule may name for one subject. */
export type WritableField<S extends AppResourceSubject> = (typeof WRITABLE_FIELDS)[S][number];

/**
 * Compile-time proof that a DTO's keys are all nameable in a rule's `fields`.
 *
 * Used as `export type ContainerPatchField = WritableKeys<"Container", keyof UpdateContainerDto>`:
 * the type argument fails to satisfy its constraint if the DTO grows a key the registry
 * does not list, which is the moment to decide whether the new field should be
 * restrictable rather than discovering later that a rule listing every *other* field
 * left it wide open.
 */
export type WritableKeys<S extends AppResourceSubject, K extends WritableField<S>> = K;

export function isWritableField(subject: AppResourceSubject, value: unknown): boolean {
  return (
    typeof value === "string" && (WRITABLE_FIELDS[subject] as readonly string[]).includes(value)
  );
}

/**
 * Which of `fields` the ability does *not* permit writing on this row.
 *
 * Asks per field rather than using `permittedFieldsOf`, which needs to be handed the
 * complete field list of the subject and answers with the permitted set: a name missing
 * from that list comes back as forbidden, so a column the registry had not caught up
 * with would 403 for everyone, including an admin holding `manage all`. Asking about
 * each field the caller actually touched cannot fail that way — a rule with no `fields`
 * matches any field, which is what makes the unrestricted case free.
 *
 * The subject must be a tagged instance (`asSubject`), not a bare name: a rule's
 * conditions and its fields are checked together, so "may edit the status of the
 * containers assigned to you" is one question, not two.
 */
export function forbiddenFields(
  ability: AppAbility,
  subject: AppSubjectInstance,
  fields: readonly string[],
): string[] {
  return fields.filter((field) => !ability.can(FIELD_SCOPED_ACTION, subject, field));
}
