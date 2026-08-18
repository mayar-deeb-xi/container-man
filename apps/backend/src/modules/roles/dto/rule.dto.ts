import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";

import type { AppResourceSubject } from "@repo/access";
import {
  ACTIONS,
  collectPlaceholders,
  CONDITION_PLACEHOLDERS,
  FIELD_SCOPED_ACTION,
  isSubject,
  SUBJECTS,
  WRITABLE_FIELDS,
} from "@repo/access";

export const MAX_RULE_FIELDS = 50;
export const MAX_CONDITIONS_BYTES = 4_000;
export const MAX_CONDITIONS_DEPTH = 6;
export const REASON_MAX = 200;

/**
 * The MongoDB query operators a stored condition may use.
 *
 * This list is exactly what `createAppAbility` can evaluate, and keeping the two equal is
 * the whole point. An unsupported operator does not raise when a rule is evaluated — ucast
 * reads `{ $or: [...] }` as a comparison against a field named `$or`, matches nothing, and
 * the role quietly grants less than it says. The only place anyone is watching is the write,
 * so that is where the set is enforced.
 *
 * The four logical operators are here because `@repo/access` registers them with the matcher
 * on purpose; they are not in CASL's default set. `$mod` and `$where` are left out: the
 * first has no use here, and the second evaluates a caller-supplied function.
 */
const ALLOWED_OPERATORS = new Set([
  "$eq",
  "$ne",
  "$lt",
  "$lte",
  "$gt",
  "$gte",
  "$in",
  "$nin",
  "$all",
  "$size",
  "$exists",
  "$regex",
  "$options",
  "$elemMatch",
  "$and",
  "$or",
  "$nor",
  "$not",
]);

interface ConditionProblem {
  message: string;
}

/**
 * Walks a condition tree and reports the first thing wrong with it.
 *
 * The checks are all about failure modes that are invisible once saved: a rule with
 * an unknown placeholder, or an operator CASL does not implement, is not rejected at
 * evaluation time — it simply matches nothing, and the role appears to grant a
 * permission it does not. Rejecting it at the form is the only point where anyone
 * is watching.
 */
function inspectConditions(value: unknown): ConditionProblem | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { message: "conditions must be a JSON object" };
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_CONDITIONS_BYTES) {
    return { message: `conditions must be under ${MAX_CONDITIONS_BYTES} characters` };
  }

  const unknownPlaceholder = collectPlaceholders(value).find(
    (name) => !(CONDITION_PLACEHOLDERS as readonly string[]).includes(name),
  );
  if (unknownPlaceholder) {
    return {
      message: `unknown placeholder \${${unknownPlaceholder}} — available: ${CONDITION_PLACEHOLDERS.map(
        (name) => `\${${name}}`,
      ).join(", ")}`,
    };
  }

  const walk = (node: unknown, depth: number): ConditionProblem | null => {
    if (depth > MAX_CONDITIONS_DEPTH) {
      return { message: `conditions may not nest deeper than ${MAX_CONDITIONS_DEPTH} levels` };
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        const problem = walk(item, depth + 1);
        if (problem) return problem;
      }
      return null;
    }

    if (node && typeof node === "object") {
      for (const [key, item] of Object.entries(node)) {
        if (key.startsWith("$") && !ALLOWED_OPERATORS.has(key)) {
          return { message: `operator ${key} is not supported in conditions` };
        }
        const problem = walk(item, depth + 1);
        if (problem) return problem;
      }
    }

    return null;
  };

  return walk(value, 1);
}

/** Validates a rule's `conditions`, reporting *why* rather than just "invalid". */
export function IsRuleConditions(options?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: "isRuleConditions",
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          return value === null || value === undefined || inspectConditions(value) === null;
        },
        defaultMessage(args: ValidationArguments) {
          return inspectConditions(args.value)?.message ?? "conditions are invalid";
        },
      },
    });
  };
}

/**
 * Walks a rule's `fields` and reports the first thing wrong with it.
 *
 * Both checks exist because the alternative is a rule that appears to restrict something
 * and does not:
 *
 *  - `fields` is only honoured on `update` (see `FIELD_SCOPED_ACTION`). Stored on a
 *    `read` rule it would look like column-level read filtering, which this API does not
 *    do; on `manage` it would be honoured for updates and silently ignored for the
 *    reads and deletes that action also covers.
 *  - A misspelled column is invisible once saved. `["despot"]` does not restrict a rule
 *    to the depot — it restricts it to a field no request will ever name, which quietly
 *    revokes the whole grant.
 *
 * Reads the sibling `action` and `subject` off the object under validation, so the
 * message can name the fields that *are* available for that subject.
 */
function inspectFields(value: unknown, rule: Partial<RuleDto>): ConditionProblem | null {
  if (value === null || value === undefined) return null;

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return { message: "fields must be an array of field names" };
  }

  if (value.length === 0) return null;

  if (rule.action !== FIELD_SCOPED_ACTION) {
    return {
      message: `fields may only be set on an ${FIELD_SCOPED_ACTION} rule — no other action is field-checked`,
    };
  }

  if (!isSubject(rule.subject) || rule.subject === "all") {
    return { message: `fields cannot be used with the "${String(rule.subject)}" subject` };
  }

  const available: readonly string[] = WRITABLE_FIELDS[rule.subject as AppResourceSubject];
  const unknown = (value as string[]).find((entry) => !available.includes(entry));

  if (unknown) {
    return {
      message: `"${unknown}" is not a writable field of ${rule.subject} — available: ${available.join(", ")}`,
    };
  }

  return null;
}

/** Validates a rule's `fields`, reporting *why* rather than just "invalid". */
export function IsRuleFields(options?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: "isRuleFields",
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, args?: ValidationArguments) {
          return inspectFields(value, (args?.object ?? {}) as Partial<RuleDto>) === null;
        },
        defaultMessage(args: ValidationArguments) {
          return (
            inspectFields(args.value, args.object as Partial<RuleDto>)?.message ??
            "fields are invalid"
          );
        },
      },
    });
  };
}

/**
 * One rule a role grants — an (action, subject) pair plus the CASL modifiers.
 *
 * `action` and `subject` name a row in the permission catalog; the service resolves
 * them to its id, so a pair that does not exist there is refused. That indirection
 * is what keeps a role from granting a permission nothing checks.
 */
export class RuleDto {
  @IsIn(ACTIONS)
  action!: (typeof ACTIONS)[number];

  @IsIn(SUBJECTS)
  subject!: (typeof SUBJECTS)[number];

  // `null` and `{}` both mean unconditional, and the form sends whichever is easier;
  // collapsing them here means the column holds one representation of "no condition".
  @Transform(({ value }) =>
    value && typeof value === "object" && Object.keys(value as object).length === 0 ? null : value,
  )
  @IsObject()
  @IsRuleConditions()
  @IsOptional()
  conditions?: Record<string, unknown> | null;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @ArrayMaxSize(MAX_RULE_FIELDS)
  @IsRuleFields()
  @IsOptional()
  fields?: string[] | null;

  @IsBoolean()
  @IsOptional()
  inverted?: boolean;

  @IsString()
  @MaxLength(REASON_MAX)
  @IsOptional()
  reason?: string | null;
}
