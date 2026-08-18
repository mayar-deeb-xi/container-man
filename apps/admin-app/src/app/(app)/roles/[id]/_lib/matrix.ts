import type { AppAction, AppResourceSubject, AppSubject } from "@repo/access";
import { FIELD_SCOPED_ACTION, permissionKey, WRITABLE_FIELDS } from "@repo/access";

import type { Permission } from "~/services/permissions/types";
import type { RoleRule, RulePayload } from "~/services/roles/types";

/**
 * One matrix cell's editable state.
 *
 * Everything is held as text rather than as parsed values because these are form
 * inputs: half-typed JSON has to survive a re-render, and parsing on every keystroke
 * would mean a field that fights back while you type in it. Parsing happens once, on
 * save, where a failure can be reported against the cell that caused it.
 */
export interface RuleDraft {
  granted: boolean;
  /** JSON object as typed. Empty means unconditional. */
  conditionsText: string;
  /** Comma-separated field list. Empty means the whole subject. */
  fieldsText: string;
  inverted: boolean;
  reason: string;
}

export type DraftMap = Record<string, RuleDraft>;

export const emptyDraft: RuleDraft = {
  granted: false,
  conditionsText: "",
  fieldsText: "",
  inverted: false,
  reason: "",
};

/** The catalog, arranged the way the matrix is drawn: one row per subject. */
export interface MatrixRow {
  subject: AppSubject;
  /** Only the actions the catalog actually offers for this subject. */
  cells: Map<AppAction, Permission>;
}

export function buildMatrix(catalog: Permission[]): MatrixRow[] {
  const bySubject = new Map<AppSubject, MatrixRow>();

  for (const entry of catalog) {
    const row = bySubject.get(entry.subject) ?? { subject: entry.subject, cells: new Map() };
    row.cells.set(entry.action, entry);
    bySubject.set(entry.subject, row);
  }

  // `all` first — it is the row that overrides every other, so burying it alphabetically
  // among the resources would misrepresent what it does.
  return [...bySubject.values()].sort((a, b) => {
    if (a.subject === "all") return -1;
    if (b.subject === "all") return 1;
    return a.subject.localeCompare(b.subject);
  });
}

/** Seeds the editor from what the role currently grants. */
export function draftsFromRules(rules: RoleRule[]): DraftMap {
  const drafts: DraftMap = {};

  for (const rule of rules) {
    drafts[permissionKey(rule.action, rule.subject)] = {
      granted: true,
      // Pretty-printed rather than compact: this lands in a textarea an operator has to
      // read and edit, not in a payload.
      conditionsText: rule.conditions ? JSON.stringify(rule.conditions, null, 2) : "",
      fieldsText: rule.fields?.join(", ") ?? "",
      inverted: rule.inverted,
      reason: rule.reason ?? "",
    };
  }

  return drafts;
}

export function draftFor(drafts: DraftMap, action: AppAction, subject: AppSubject): RuleDraft {
  return drafts[permissionKey(action, subject)] ?? emptyDraft;
}

/**
 * Whether a cell can carry a field limit at all.
 *
 * Only `update` is field-checked, and only a real subject has fields to name — so for every
 * other cell the control is not disabled, it is absent. Offering it would advertise a
 * restriction the API refuses to store, and before that refusal existed it would have
 * advertised one nothing enforced.
 */
export function acceptsFields(
  action: AppAction,
  subject: AppSubject,
): subject is AppResourceSubject {
  return action === FIELD_SCOPED_ACTION && subject !== "all";
}

/** The fields a draft names, as a list — the stored form is text, the UI wants the set. */
export function selectedFields(draft: RuleDraft): string[] {
  return draft.fieldsText
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
}

/**
 * The draft's field text with one field added or removed.
 *
 * Kept in the registry's order rather than the order they were clicked: the list is read
 * back as a set, and a stored order that depends on clicking would make two identical
 * restrictions compare as different in `isDirty`.
 */
export function toggleField(draft: RuleDraft, subject: AppResourceSubject, field: string): string {
  const current = new Set(selectedFields(draft));

  if (current.has(field)) current.delete(field);
  else current.add(field);

  return WRITABLE_FIELDS[subject].filter((name) => current.has(name)).join(", ");
}

/** True when a draft carries anything beyond the bare grant — what the UI badges. */
export function isDetailed(draft: RuleDraft): boolean {
  return Boolean(draft.conditionsText.trim() || draft.fieldsText.trim() || draft.inverted);
}

export interface BuildResult {
  rules: RulePayload[];
  /** Per-cell parse failures, keyed as `action:subject`. Non-empty means do not save. */
  errors: Record<string, string>;
}

/**
 * Turns the drafts into the payload, or into the errors that stop it.
 *
 * Only granted cells are sent, and the whole set is sent — the endpoint is a PUT, so
 * anything omitted is revoked. A cell that was granted, edited and then unchecked
 * therefore keeps its condition text in the editor while contributing nothing, which is
 * what lets someone toggle a rule off and back on without retyping it.
 */
export function buildRules(
  drafts: DraftMap,
  catalog: Permission[],
  messages: { invalidJson: string; notAnObject: string },
): BuildResult {
  const rules: RulePayload[] = [];
  const errors: Record<string, string> = {};

  for (const entry of catalog) {
    const key = permissionKey(entry.action, entry.subject);
    const draft = drafts[key];
    if (!draft?.granted) continue;

    let conditions: Record<string, unknown> | null = null;
    const text = draft.conditionsText.trim();

    if (text) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          errors[key] = messages.notAnObject;
          continue;
        }
        conditions = parsed as Record<string, unknown>;
      } catch {
        errors[key] = messages.invalidJson;
        continue;
      }
    }

    // Dropped outright on an action that is not field-checked. A rule written through the
    // API before that was refused would otherwise be sent back as-is and rejected, leaving
    // the operator with a 400 about a control the editor never showed them.
    const fields = acceptsFields(entry.action, entry.subject) ? selectedFields(draft) : [];

    rules.push({
      action: entry.action,
      subject: entry.subject,
      conditions,
      fields: fields.length > 0 ? fields : null,
      inverted: draft.inverted,
      reason: draft.reason.trim() || null,
    });
  }

  return { rules, errors };
}

/**
 * Whether the editor differs from what was loaded.
 *
 * Compared as normalised drafts rather than by tracking every edit: a user who types
 * into a condition and undoes it should not be told there are unsaved changes, and the
 * only reliable way to know that is to compare the values.
 */
export function isDirty(drafts: DraftMap, original: DraftMap, catalog: Permission[]): boolean {
  return catalog.some((entry) => {
    const key = permissionKey(entry.action, entry.subject);
    const a = drafts[key] ?? emptyDraft;
    const b = original[key] ?? emptyDraft;

    // An ungranted cell's leftover text is not a change — it is never sent.
    if (!a.granted && !b.granted) return false;

    return (
      a.granted !== b.granted ||
      a.conditionsText.trim() !== b.conditionsText.trim() ||
      a.fieldsText.trim() !== b.fieldsText.trim() ||
      a.inverted !== b.inverted ||
      a.reason.trim() !== b.reason.trim()
    );
  });
}
