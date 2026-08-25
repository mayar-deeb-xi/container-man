import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";

import type { AppResourceSubject, RuleContext } from "@repo/access";
import {
  ACTIONS,
  collectPlaceholders,
  CONDITION_PLACEHOLDERS,
  FIELD_SCOPED_ACTION,
  interpolateConditions,
  isSubject,
  SUBJECTS,
  WRITABLE_FIELDS,
} from "@repo/access";

import {
  assertConditionsTranslatable,
  UntranslatableRuleError,
} from "../../../lib/ability/ability-where";
import { CONDITION_COLUMNS } from "../../../lib/ability/condition-columns";

export const MAX_RULE_FIELDS = 50;
export const MAX_CONDITIONS_BYTES = 4_000;
export const MAX_CONDITIONS_DEPTH = 6;

/**
 * Stands in for each placeholder while a condition is validated.
 *
 * A condition is validated by *compiling* it — the same translation the list queries run
 * (`assertConditionsTranslatable`), and that compiler checks values against column types.
 * A placeholder's stored form is a string like `${user.id}`, which is not the shape it
 * has at request time, so each is substituted with a value of the type it actually
 * resolves to: `user.id` is always a UUID, `user.email` never is. That is what refuses
 * `{ "assignedToId": "${user.email}" }` at the form instead of letting it 500 every list
 * request of everyone holding the role.
 */
const REPRESENTATIVE_CONTEXT: RuleContext = {
  user: { id: "00000000-0000-0000-0000-000000000000", email: "operator@example.com" },
};

interface ConditionProblem {
  message: string;
}

/**
 * Walks a condition tree and reports the first thing wrong with it.
 *
 * The decisive check is the last one: the condition is *compiled*, by the same
 * translation the list queries run (`assertConditionsTranslatable`), against the same
 * columns of the same table. A condition this function accepts is therefore one
 * `abilityWhere` is guaranteed to turn into an exact WHERE clause — the write is the
 * only point where anyone is watching, and validating with a second implementation
 * would let the two drift, which would surface as a 500 on a list endpoint months
 * after the rule was saved.
 *
 * The checks before it are the ones the compiler cannot make: bounds that keep a
 * hostile payload from being walked at all, placeholders (substituted before
 * compiling, so the compiler sees the value shape each resolves to), and the subject
 * — conditions need a table to compile against, which the `all` wildcard does not name.
 */
function inspectConditions(value: unknown, rule: Partial<RuleDto>): ConditionProblem | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { message: "conditions must be a JSON object" };
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_CONDITIONS_BYTES) {
    return { message: `conditions must be under ${MAX_CONDITIONS_BYTES} characters` };
  }

  const walk = (node: unknown, depth: number): ConditionProblem | null => {
    if (depth > MAX_CONDITIONS_DEPTH) {
      return { message: `conditions may not nest deeper than ${MAX_CONDITIONS_DEPTH} levels` };
    }

    if (Array.isArray(node) || (node && typeof node === "object")) {
      for (const item of Object.values(node)) {
        const problem = walk(item, depth + 1);
        if (problem) return problem;
      }
    }

    return null;
  };

  const tooDeep = walk(value, 1);
  if (tooDeep) return tooDeep;

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

  // A malformed subject is its own validator's finding — reporting it against the
  // conditions too would blame the wrong field.
  if (!isSubject(rule.subject)) return null;

  if (rule.subject === "all") {
    return {
      message:
        'conditions cannot be used on an "all" rule — grant each subject its own conditional rule instead',
    };
  }

  const interpolated = interpolateConditions(
    value as Record<string, unknown>,
    REPRESENTATIVE_CONTEXT,
  );
  // Unreachable after the placeholder check above, but a null here must not pass as valid.
  if (!interpolated) {
    return { message: "conditions contain a placeholder that cannot be resolved" };
  }

  try {
    assertConditionsTranslatable(interpolated, CONDITION_COLUMNS[rule.subject]);
  } catch (error) {
    if (error instanceof UntranslatableRuleError) return { message: error.message };
    throw error;
  }

  return null;
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
        validate(value: unknown, args?: ValidationArguments) {
          return (
            value === null ||
            value === undefined ||
            inspectConditions(value, (args?.object ?? {}) as Partial<RuleDto>) === null
          );
        },
        defaultMessage(args: ValidationArguments) {
          return (
            inspectConditions(args.value, args.object as Partial<RuleDto>)?.message ??
            "conditions are invalid"
          );
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
}
