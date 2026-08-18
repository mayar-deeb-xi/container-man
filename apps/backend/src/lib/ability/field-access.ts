import { ForbiddenException } from "@nestjs/common";

import type { AppAbility, AppSubjectInstance } from "@repo/access";
import { FIELD_SCOPED_ACTION, forbiddenFields } from "@repo/access";

/**
 * The keys a PATCH body actually carries.
 *
 * A DTO is a class, and under `target: ES2022` its declared fields exist on every
 * instance — so `Object.keys(dto)` lists every optional field whether the client sent it
 * or not, and testing key presence would refuse a write the caller never attempted.
 * `undefined` is the absent value; `null` is a value, because clearing a column is
 * writing to it.
 */
export function touchedFields(dto: object): string[] {
  return Object.entries(dto)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

/**
 * Refuses a write that touches fields the caller's rules do not cover.
 *
 * The route guard cannot do this: it knows the caller may update *some* record of this
 * type, but not which columns the body names, and CASL deliberately answers "yes" to a
 * fieldless `can("update", row)` even when every matching rule is field-scoped — the
 * per-field question is a separate one, and this is where it gets asked.
 *
 * Called with the row already loaded, so a rule's `conditions` and its `fields` are
 * evaluated against the same object: "may set the status of the boxes assigned to you"
 * is one rule, and checking the two halves against different things would let either be
 * satisfied by the wrong record.
 */
export function assertFieldsAllowed(
  ability: AppAbility,
  subject: AppSubjectInstance,
  fields: readonly string[],
): void {
  const forbidden = forbiddenFields(ability, subject, fields);
  if (forbidden.length === 0) return;

  // An inverted rule carries its own explanation, and the first refused field is the one
  // to ask about — a rule that says "never the assignee" should say so rather than be
  // reported as a list of column names the operator has to map back to a rule themselves.
  const [first] = forbidden;
  const rule = first ? ability.relevantRuleFor(FIELD_SCOPED_ACTION, subject, first) : null;

  throw new ForbiddenException(
    rule?.reason ?? `Your permissions do not cover these fields: ${forbidden.join(", ")}`,
  );
}
