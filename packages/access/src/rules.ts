import type { AppAction, AppSubject } from "./vocabulary";

/**
 * One stored rule, in the shape CASL already reads.
 *
 * This is deliberately CASL's `RawRule` and not a private format that gets
 * translated: a `role_permissions` row, the JSON on the wire, and what
 * `createAppAbility` consumes are all the same object, so there is no mapper in
 * the middle to disagree with itself.
 */
export interface AppRule {
  action: AppAction;
  subject: AppSubject;
  /**
   * MongoDB-style query matched against the subject instance, so a rule can say
   * "only the containers you own". `null` means unconditional.
   *
   * Values may contain `${user.id}`-style placeholders — see
   * `interpolateConditions`, which resolves them per request.
   */
  conditions?: Record<string, unknown> | null;
  /** Restricts the rule to these fields; `null` means the whole subject. */
  fields?: string[] | null;
  /** A deny rule. CASL gives these precedence over any allow they overlap. */
  inverted?: boolean;
  /** Shown to the user when an inverted rule is what refused them. */
  reason?: string | null;
}

/** The variables a condition placeholder may reference. */
export interface RuleContext {
  user: {
    id: string;
    email: string;
  };
}

/**
 * Placeholders a stored condition may use, as `${…}`.
 *
 * The list is closed on purpose: it is what the API validates writes against, so
 * an operator cannot save a condition whose placeholder resolves to nothing at
 * request time — a rule that silently grants nothing is worse than a rejected
 * form.
 */
export const CONDITION_PLACEHOLDERS = ["user.id", "user.email"] as const;

export type ConditionPlaceholder = (typeof CONDITION_PLACEHOLDERS)[number];

const PLACEHOLDER_PATTERN = /\$\{\s*([\w.]+)\s*\}/g;

/** Same pattern anchored, so "is this string nothing but a placeholder" is one test. */
const WHOLE_PLACEHOLDER = /^\$\{\s*([\w.]+)\s*\}$/;

/** Every placeholder used in a condition tree, in encounter order. */
export function collectPlaceholders(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
      const name = match[1];
      if (name && !found.includes(name)) found.push(name);
    }
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectPlaceholders(item, found);
    return found;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectPlaceholders(item, found);
  }

  return found;
}

function resolve(name: string, context: RuleContext): string | undefined {
  switch (name) {
    case "user.id":
      return context.user.id;
    case "user.email":
      return context.user.email;
    default:
      return undefined;
  }
}

/**
 * Substitutes `${user.id}`-style placeholders throughout a condition tree.
 *
 * A string that is *only* a placeholder is replaced by the value itself rather
 * than by its interpolation, so `{ "assignedToId": "${user.id}" }` compares a uuid to a
 * uuid. Mixed strings (`"acct-${user.id}"`) still interpolate, which is what makes
 * prefixed keys expressible.
 *
 * Returns `null` when a placeholder cannot be resolved. Callers drop the rule
 * rather than keeping a half-substituted one: `{ assignedToId: "${user.id}" }` left
 * literal would match no row, but `{ assignedToId: null }` could match rows nobody
 * owns. Writes are validated against `CONDITION_PLACEHOLDERS`, so this is a
 * backstop for rules that predate a placeholder being removed.
 */
export function interpolateConditions(
  conditions: Record<string, unknown>,
  context: RuleContext,
): Record<string, unknown> | null {
  let failed = false;

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      const whole = WHOLE_PLACEHOLDER.exec(value);

      if (whole?.[1]) {
        const resolved = resolve(whole[1], context);
        if (resolved === undefined) failed = true;
        return resolved;
      }

      return value.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
        const resolved = resolve(name, context);
        if (resolved === undefined) failed = true;
        return resolved ?? "";
      });
    }

    if (Array.isArray(value)) return value.map(walk);

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, walk(item)]),
      );
    }

    return value;
  };

  const result = walk(conditions) as Record<string, unknown>;
  return failed ? null : result;
}

/**
 * Resolves a stored rule against a request's context and drops the empty keys.
 *
 * CASL treats a present-but-null `conditions` as a condition, so the nulls a
 * nullable column hands back have to be stripped rather than passed through —
 * otherwise an unconditional grant would match nothing.
 */
export function packRule(rule: AppRule, context: RuleContext): AppRule | null {
  const packed: AppRule = { action: rule.action, subject: rule.subject };

  if (rule.conditions && Object.keys(rule.conditions).length > 0) {
    const conditions = interpolateConditions(rule.conditions, context);
    if (!conditions) return null;
    packed.conditions = conditions;
  }

  if (rule.fields && rule.fields.length > 0) packed.fields = rule.fields;
  if (rule.inverted) packed.inverted = true;
  if (rule.reason) packed.reason = rule.reason;

  return packed;
}

export function packRules(rules: AppRule[], context: RuleContext): AppRule[] {
  return rules
    .map((rule) => packRule(rule, context))
    .filter((rule): rule is AppRule => rule !== null);
}
