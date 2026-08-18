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

import { ACTIONS, collectPlaceholders, CONDITION_PLACEHOLDERS, SUBJECTS } from "@repo/access";

export const MAX_RULE_FIELDS = 50;
export const MAX_CONDITIONS_BYTES = 4_000;
export const MAX_CONDITIONS_DEPTH = 6;
export const REASON_MAX = 200;

/**
 * The MongoDB query operators a stored condition may use.
 *
 * An allowlist rather than a denylist: CASL evaluates these through
 * `@ucast/mongo2js`, and the set it understands is small and known, so anything
 * outside it is either a typo — a silently non-matching rule — or an attempt at
 * something the evaluator was not meant to do. Listing what is permitted means a
 * future operator added upstream cannot arrive here unreviewed.
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
