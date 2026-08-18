import type { AppAction, AppSubject } from "@repo/access";
import { permissionKey } from "@repo/access";

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

    const fields = draft.fieldsText
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);

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
