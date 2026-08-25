"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Braces, Plus, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AppResourceSubject, AppSubject, ConditionField } from "@repo/access";
import { CONDITION_FIELDS } from "@repo/access";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import type { ConditionModel, ConditionRow, RowOperator } from "../_lib/conditions";
import {
  defaultRow,
  defaultValue,
  fieldByName,
  operatorsFor,
  parseConditions,
  rowProblem,
  serializeConditions,
  token,
} from "../_lib/conditions";

/**
 * A sample condition for the JSON editor's placeholder, in code rather than in the
 * message catalogue: ICU MessageFormat reads `{` as an argument, and being code it
 * would be the same sample in every language anyway.
 */
export const CONDITIONS_EXAMPLE = '{ "assignedToId": "' + token("user.id") + '" }';

/** The message key an operator renders with, for one row. */
function operatorKey(field: ConditionField, operator: RowOperator): string {
  switch (operator) {
    case "eq":
      return "is";
    case "ne":
      return "isNot";
    case "in":
      return "anyOf";
    case "nin":
      return "noneOf";
    case "empty":
      return "empty";
    case "notEmpty":
      return "notEmpty";
    default:
      // The four range operators read differently over time than over quantity:
      // "after 2026-01-01" versus "more than 45".
      return operator + (field.kind === "date" ? "Date" : "Number");
  }
}

/**
 * A translator whose keys come from data, not literals.
 *
 * next-intl types `t` against the message catalogue, which is right for hand-written
 * keys and impossible for these: the field and value names are the registry's and the
 * vocabulary's. The cast trades that compile check for the schema test that pins the
 * registry — a missing entry shows up as the raw key on screen, not as a crash.
 */
type DynamicTranslator = (key: string, values?: Record<string, string | number>) => string;

/** Every translator the phrases need, bundled so the two consumers share one signature. */
interface Translators {
  tm: ReturnType<typeof useTranslations<"Roles.matrix">>;
  tf: DynamicTranslator;
  top: DynamicTranslator;
  tc: DynamicTranslator;
}

/** A stored value as the word an operator would say for it. */
function valueLabel(
  subject: AppResourceSubject,
  field: ConditionField,
  raw: string,
  { tm, tc }: Translators,
): string {
  if (field.kind === "user" && raw === token("user.id")) return tm("signedInUser");
  if (field.kind === "text" && raw === token("user.email")) return tm("signedInEmail");
  if (field.kind === "boolean") return raw === "true" ? tm("booleanTrue") : tm("booleanFalse");
  // The container vocabulary is already translated for the fleet pages; the builder
  // says "Loaded", not "loaded", by reading the same catalogue entries.
  if (field.kind === "enum" && subject === "Container") return tc(`${field.name}.${raw}`);
  return raw;
}

/** One row as a sentence fragment: "Assigned user is the signed-in user". */
function rowPhrase(subject: AppResourceSubject, row: ConditionRow, translators: Translators): string {
  const { tf, top } = translators;
  const field = fieldByName(CONDITION_FIELDS[subject], row.field);
  if (!field) return row.field;

  const value =
    row.operator === "in" || row.operator === "nin"
      ? row.values.map((entry) => valueLabel(subject, field, entry, translators)).join(", ")
      : valueLabel(subject, field, row.value, translators);

  return `${tf(`${subject}.${row.field}`)} ${top(operatorKey(field, row.operator), { value })}`;
}

function useTranslators(): Translators {
  return {
    tm: useTranslations("Roles.matrix"),
    tf: useTranslations("Roles.conditionFields") as unknown as DynamicTranslator,
    top: useTranslations("Roles.conditionOps") as unknown as DynamicTranslator,
    tc: useTranslations("Containers") as unknown as DynamicTranslator,
  };
}

/**
 * A stored condition as one plain-language sentence, or `null` when it has no builder
 * representation (or nothing to say). What the collapsed rule rows use as their
 * preview — the same words the builder's own summary shows, so the folded and unfolded
 * views of a rule never describe it differently.
 */
export function useConditionDescriber(): (subject: AppSubject, text: string) => string | null {
  const translators = useTranslators();
  const { tm, tf, top, tc } = translators;

  return useCallback(
    (subject: AppSubject, text: string) => {
      if (subject === "all") return null;
      const model = parseConditions(text, CONDITION_FIELDS[subject]);
      if (!model || model.rows.length === 0) return null;

      const joiner = model.combinator === "or" ? tm("joinOr") : tm("joinAnd");
      return model.rows
        .map((row) => rowPhrase(subject, row, translators))
        .join(` ${joiner} `);
    },
    // The bundle is rebuilt each render; its members are what memoization can hold onto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tm, tf, top, tc],
  );
}

/**
 * The conditions editor: clicks first, JSON as the escape hatch.
 *
 * A condition is a typed query over a known table, and the API refuses everything
 * outside a closed vocabulary — so there is no reason to make an operator *write* one.
 * The builder offers exactly what the translator compiles: the registry's columns, the
 * comparisons each column supports, and values of the column's own type, with "the
 * signed-in user" as a choice rather than a `${user.id}` incantation to know.
 *
 * It reads and writes the draft's `conditionsText`, not a store of its own: every
 * click serializes straight back to the JSON the save flow already sends, so the dirty
 * check, reset and API validation are all untouched. A stored condition the flat
 * row list cannot draw faithfully — nesting, negation, a column outside the registry —
 * opens in the JSON editor instead, with the builder disabled rather than approximate.
 */
export function ConditionBuilder({
  subject,
  cellKey,
  value,
  disabled,
  error,
  onChange,
}: {
  subject: AppResourceSubject;
  cellKey: string;
  /** The draft's `conditionsText` — the JSON string, owned by the matrix. */
  value: string;
  disabled: boolean;
  /** The save-time parse failure for this cell, if any. */
  error?: string;
  onChange: (text: string) => void;
}) {
  const translators = useTranslators();
  const { tm, tf, top } = translators;

  const fields = CONDITION_FIELDS[subject];

  const [model, setModel] = useState<ConditionModel | null>(() => parseConditions(value, fields));
  const [jsonMode, setJsonMode] = useState(() => parseConditions(value, fields) === null);

  /**
   * The last text this editor produced or saw. Edits made here already have their model;
   * only an outside change to the draft — reset, a refetch after save — needs re-parsing,
   * and re-parsing on every render would rebuild rows mid-keystroke.
   */
  const lastText = useRef(value);
  useEffect(() => {
    if (value === lastText.current) return;
    lastText.current = value;
    const parsed = parseConditions(value, fields);
    setModel(parsed);
    if (parsed === null) setJsonMode(true);
  }, [value, fields]);

  function apply(next: ConditionModel) {
    setModel(next);
    const text = serializeConditions(next, fields);
    lastText.current = text;
    onChange(text);
  }

  const rows = model?.rows ?? [];

  function updateRow(index: number, next: ConditionRow) {
    if (!model) return;
    apply({ ...model, rows: model.rows.map((row, i) => (i === index ? next : row)) });
  }

  function changeOperator(index: number, row: ConditionRow, field: ConditionField, operator: RowOperator) {
    const next: ConditionRow = { ...row, operator };
    if (operator === "in" || operator === "nin") {
      // A picked scalar becomes the set's first member instead of being thrown away.
      next.values = row.values.length > 0 ? row.values : row.value ? [row.value] : [];
    } else if (operator !== "empty" && operator !== "notEmpty" && !row.value) {
      next.value = row.values[0] ?? defaultValue(field);
    }
    updateRow(index, next);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={jsonMode ? `${cellKey}-conditions` : undefined}>{tm("conditions")}</Label>
      <p className="text-muted-foreground text-xs">{tm("conditionsIntro")}</p>

      {jsonMode ? (
        <>
          {/* JSON is not localised text and its keys are identifiers — LTR either way. */}
          <Textarea
            id={`${cellKey}-conditions`}
            dir="ltr"
            rows={4}
            className="font-mono text-xs"
            placeholder={CONDITIONS_EXAMPLE}
            disabled={disabled}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {tm("conditionsHint", {
              userId: token("user.id"),
              userEmail: token("user.email"),
            })}
          </p>
          {model === null && value.trim() ? (
            <p className="text-muted-foreground text-xs">{tm("jsonUnsupported")}</p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={model === null}
            onClick={() => setJsonMode(false)}
          >
            <SlidersHorizontal />
            {tm("backToBuilder")}
          </Button>
        </>
      ) : (
        <>
          {rows.length > 1 ? (
            // Which way the rows combine — the one choice that changes what the whole
            // condition means, so it sits above them rather than at the end.
            <div className="flex gap-1" role="group">
              {(["and", "or"] as const).map((combinator) => (
                <Button
                  key={combinator}
                  type="button"
                  size="sm"
                  variant={model?.combinator === combinator ? "secondary" : "ghost"}
                  className="h-7 text-xs"
                  disabled={disabled}
                  aria-pressed={model?.combinator === combinator}
                  onClick={() => model && apply({ ...model, combinator })}
                >
                  {combinator === "and" ? tm("matchAll") : tm("matchAny")}
                </Button>
              ))}
            </div>
          ) : null}

          {rows.map((row, index) => {
            const field = fieldByName(fields, row.field);
            if (!field) return null;
            const problem = rowProblem(row, field);

            return (
              // Index keys are safe here: rows have no identity beyond their position,
              // and reordering is not an operation the editor offers.
              <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                <Select
                  value={row.field}
                  disabled={disabled}
                  onValueChange={(name) => {
                    const picked = fieldByName(fields, name);
                    // A field change resets the comparison and value: they were typed
                    // against the old column and rarely survive the move meaningfully.
                    if (picked) updateRow(index, defaultRow(picked));
                  }}
                >
                  <SelectTrigger className="w-44" aria-label={tm("field")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((entry) => (
                      <SelectItem key={entry.name} value={entry.name}>
                        {tf(`${subject}.${entry.name}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={row.operator}
                  disabled={disabled}
                  onValueChange={(operator) =>
                    changeOperator(index, row, field, operator as RowOperator)
                  }
                >
                  <SelectTrigger className="w-40" aria-label={tm("comparison")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operatorsFor(field).map((operator) => (
                      <SelectItem key={operator} value={operator}>
                        {/* The phrase message with its value blanked out: "is more
                            than {value}" reads "is more than" as a menu entry, and
                            one catalogue entry serves both. */}
                        {top(operatorKey(field, operator), { value: "" }).trim()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <ValueControl
                  subject={subject}
                  field={field}
                  row={row}
                  disabled={disabled}
                  translators={translators}
                  onChange={(next) => updateRow(index, next)}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ms-auto size-7"
                  disabled={disabled}
                  aria-label={tm("removeCondition")}
                  onClick={() => model && apply({ ...model, rows: rows.filter((_, i) => i !== index) })}
                >
                  <X />
                </Button>

                {problem ? (
                  <p className="text-destructive basis-full text-xs">
                    {problem === "values" ? tm("valuesMissing") : tm("valueMissing")}
                  </p>
                ) : null}
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={disabled}>
                  <Plus />
                  {tm("addCondition")}
                </Button>
              </DropdownMenuTrigger>
              {/* Adding starts from "which column?", so the menu is the field list —
                  landing in a row whose selects then need re-picking would make every
                  add a three-step errand. */}
              <DropdownMenuContent align="start">
                {fields.map((entry) => (
                  <DropdownMenuItem
                    key={entry.name}
                    onSelect={() => model && apply({ ...model, rows: [...rows, defaultRow(entry)] })}
                  >
                    {tf(`${subject}.${entry.name}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setJsonMode(true)}
            >
              <Braces />
              {tm("editAsJson")}
            </Button>
          </div>

          {/* What the clicks amount to, in words — the running answer to "what did I
              just grant?". Also all a read-only viewer needs, which is why it renders
              regardless of `disabled`. */}
          <div className="bg-muted/50 rounded-lg p-2.5 text-xs">
            {rows.length === 0 ? (
              <span className="text-muted-foreground">{tm("summaryEvery")}</span>
            ) : (
              <>
                <span className="text-muted-foreground">{tm("summaryLead")} </span>
                <span>
                  {rows
                    .map((row) => rowPhrase(subject, row, translators))
                    .join(` ${model?.combinator === "or" ? tm("joinOr") : tm("joinAnd")} `)}
                </span>
              </>
            )}
          </div>
        </>
      )}

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

/**
 * The value side of one row, drawn as the column's type: choices where the values are
 * a closed list, a typed input only where they are genuinely free — and never a
 * placeholder to memorise. Renders nothing for `empty`/`notEmpty`, which carry no value.
 */
function ValueControl({
  subject,
  field,
  row,
  disabled,
  translators,
  onChange,
}: {
  subject: AppResourceSubject;
  field: ConditionField;
  row: ConditionRow;
  disabled: boolean;
  translators: Translators;
  onChange: (row: ConditionRow) => void;
}) {
  const { tm, tc } = translators;

  if (row.operator === "empty" || row.operator === "notEmpty") return null;

  const setValue = (value: string) => onChange({ ...row, value });

  if (row.operator === "in" || row.operator === "nin") {
    const choices: string[] =
      field.kind === "enum"
        ? [...field.values]
        : field.kind === "number"
          ? (field.options ?? []).map(String)
          : [];

    return (
      <div className="flex flex-wrap gap-1.5">
        {choices.map((choice) => {
          const chosen = row.values.includes(choice);
          return (
            <Button
              key={choice}
              type="button"
              size="sm"
              variant={chosen ? "default" : "outline"}
              className="h-7 text-xs"
              disabled={disabled}
              aria-pressed={chosen}
              onClick={() =>
                // Kept in the list's own order, like the field chips: a set must
                // serialize the same way no matter the clicking order, or `isDirty`
                // would see a change where none was made.
                onChange({
                  ...row,
                  values: choices.filter((entry) =>
                    entry === choice ? !chosen : row.values.includes(entry),
                  ),
                })
              }
            >
              {valueLabel(subject, field, choice, translators)}
            </Button>
          );
        })}
      </div>
    );
  }

  switch (field.kind) {
    case "enum":
      return (
        <Select value={row.value} disabled={disabled} onValueChange={setValue}>
          <SelectTrigger className="w-44" aria-label={tm("value")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.values.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {subject === "Container" ? tc(`${field.name}.${entry}`) : entry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "boolean":
      return (
        <Select value={row.value} disabled={disabled} onValueChange={setValue}>
          <SelectTrigger className="w-28" aria-label={tm("value")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">{tm("booleanTrue")}</SelectItem>
            <SelectItem value="false">{tm("booleanFalse")}</SelectItem>
          </SelectContent>
        </Select>
      );

    case "number":
      if (field.options && (row.operator === "eq" || row.operator === "ne")) {
        return (
          <Select value={row.value} disabled={disabled} onValueChange={setValue}>
            <SelectTrigger className="w-28" aria-label={tm("value")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      return (
        <Input
          type="number"
          dir="ltr"
          className="w-32"
          aria-label={tm("value")}
          disabled={disabled}
          value={row.value}
          onChange={(event) => setValue(event.target.value)}
        />
      );

    case "date":
      return (
        <Input
          type="date"
          dir="ltr"
          className="w-40"
          aria-label={tm("value")}
          disabled={disabled}
          value={row.value}
          onChange={(event) => setValue(event.target.value)}
        />
      );

    case "user": {
      const isToken = row.value === token("user.id");
      return (
        <>
          <Select
            value={isToken ? "me" : "custom"}
            disabled={disabled}
            onValueChange={(mode) => setValue(mode === "me" ? token("user.id") : "")}
          >
            <SelectTrigger className="w-56" aria-label={tm("value")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="me">{tm("signedInUser")}</SelectItem>
              <SelectItem value="custom">{tm("specificUser")}</SelectItem>
            </SelectContent>
          </Select>
          {!isToken ? (
            <Input
              dir="ltr"
              className="w-72 font-mono text-xs"
              placeholder={tm("userIdPlaceholder")}
              aria-label={tm("value")}
              disabled={disabled}
              value={row.value}
              onChange={(event) => setValue(event.target.value)}
            />
          ) : null}
        </>
      );
    }

    case "text": {
      if (!field.placeholder) {
        return (
          <Input
            dir="ltr"
            className="w-56"
            aria-label={tm("value")}
            disabled={disabled}
            value={row.value}
            onChange={(event) => setValue(event.target.value)}
          />
        );
      }

      const placeholderValue = token(field.placeholder);
      const isToken = row.value === placeholderValue;
      return (
        <>
          <Select
            value={isToken ? "me" : "custom"}
            disabled={disabled}
            onValueChange={(mode) => setValue(mode === "me" ? placeholderValue : "")}
          >
            <SelectTrigger className="w-64" aria-label={tm("value")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="me">{tm("signedInEmail")}</SelectItem>
              <SelectItem value="custom">{tm("specificValue")}</SelectItem>
            </SelectContent>
          </Select>
          {!isToken ? (
            <Input
              dir="ltr"
              className="w-56"
              aria-label={tm("value")}
              disabled={disabled}
              value={row.value}
              onChange={(event) => setValue(event.target.value)}
            />
          ) : null}
        </>
      );
    }
  }
}
