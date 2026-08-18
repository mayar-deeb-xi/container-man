"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Lock, RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { AppAction, AppSubject, ConditionPlaceholder } from "@repo/access";
import { ACTIONS, permissionKey, WRITABLE_FIELDS } from "@repo/access";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Textarea } from "@repo/ui/components/textarea";

import type { DraftMap, RuleDraft } from "../_lib/matrix";
import type { Permission } from "~/services/permissions/types";
import type { RoleDetail } from "~/services/roles/types";
import { useFieldAccess } from "~/components/providers/ability-provider";
import { getApiErrorMessage } from "~/lib/axios";
import { useSetRolePermissions } from "~/services/roles/use-set-role-permissions";
import {
  acceptsFields,
  buildMatrix,
  buildRules,
  draftFor,
  draftsFromRules,
  emptyDraft,
  isDetailed,
  isDirty,
  selectedFields,
  toggleField,
} from "../_lib/matrix";

/**
 * Spells a placeholder the way it is typed into a condition.
 *
 * Takes a `ConditionPlaceholder` rather than a string, so the hint can only advertise a
 * placeholder the API actually resolves — removing one from `@repo/access` breaks this
 * line rather than leaving the console recommending it.
 */
function token(name: ConditionPlaceholder): string {
  return "${" + name + "}";
}

/**
 * A sample condition, in code rather than in the message catalogue.
 *
 * ICU MessageFormat reads `{` as the start of an argument, so a JSON sample cannot live
 * in a translation without escaping every brace — and being code, it would be the same
 * sample in every language anyway.
 */
const CONDITIONS_EXAMPLE = '{ "assignedToId": "' + token("user.id") + '" }';

/**
 * The permission editor: every action against every subject, as one grid.
 *
 * A grid rather than a list of rules because the question an operator arrives with is
 * "what can this role do?", and a list only answers "what rules exist" — the difference
 * shows the moment you look for something that is *not* granted.
 *
 * Saving is a single PUT of the whole set. The draft state is local until then, so a
 * half-finished matrix is never a half-applied role.
 */
export function PermissionMatrix({ role, catalog }: { role: RoleDetail; catalog: Permission[] }) {
  const t = useTranslations("Roles.matrix");
  const ta = useTranslations("Roles.verbs");
  const ts = useTranslations("Roles.subjects");
  const tc = useTranslations("Common");

  const setPermissions = useSetRolePermissions();

  // What a role grants is a field of the role — see `WRITABLE_FIELDS` — so this asks the
  // exact question `PUT /roles/:id/permissions` will ask, against this role. It subsumes
  // the plain `update Role` check: a rule that does not cover `permissions`, or whose
  // conditions do not match this row, fails it. A role editor who may rename roles but not
  // re-grant them therefore sees the grid read-only, which is what the API would enforce.
  const canWriteField = useFieldAccess("Role", role);
  const canEdit = canWriteField("permissions") && !role.isLocked;

  const matrix = useMemo(() => buildMatrix(catalog), [catalog]);
  const original = useMemo(() => draftsFromRules(role.rules), [role.rules]);

  const [drafts, setDrafts] = useState<DraftMap>(original);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * The per-rule editor is closed until asked for.
   *
   * Granting a permission is the common errand and the grid answers it on its own; deciding
   * whether that grant should be narrowed by a Mongo-style query is not something to put in
   * front of someone who came to tick a box. Closed by default, and the header still reports
   * what is inside — so nothing is hidden, only folded.
   */
  const [detailsOpen, setDetailsOpen] = useState(false);

  /**
   * Which per-rule panels are expanded, held here rather than left to each `Collapsible`.
   *
   * Two reasons. Folding the section unmounts its content, so uncontrolled panels would
   * silently reset every time it closed — reopening to find your place lost. And a save that
   * fails on a condition has to be able to *open* the panel holding it: unfolding the section
   * alone leaves an `Invalid` badge and no visible reason, which is the same hunt as before
   * with an extra click.
   */
  const [openCells, setOpenCells] = useState<string[]>([]);

  function toggleCell(key: string, open: boolean) {
    setOpenCells((current) => (open ? [...current, key] : current.filter((cell) => cell !== key)));
  }

  // Re-seeded when the role's saved rules change — after a save, or when another tab's
  // change arrives through a refetch. Without this the editor would keep showing the
  // state it was mounted with and quietly re-submit it.
  useEffect(() => {
    setDrafts(original);
    setErrors({});
  }, [original]);

  const dirty = isDirty(drafts, original, catalog);

  function update(action: AppAction, subject: AppSubject, patch: Partial<RuleDraft>) {
    const key = permissionKey(action, subject);
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? emptyDraft), ...patch } }));
    // Clear the cell's error as soon as it is edited: leaving it would keep reporting a
    // parse failure against text that has since changed.
    setErrors((current) => {
      if (!current[key]) return current;
      return Object.fromEntries(Object.entries(current).filter(([cell]) => cell !== key));
    });
  }

  async function onSave() {
    const { rules, errors: found } = buildRules(drafts, catalog, {
      invalidJson: t("invalidJson"),
      notAnObject: t("notAnObject"),
    });

    // Reported per cell rather than as a toast: "which of the sixteen conditions is
    // wrong?" is the only question a toast would leave the operator with.
    if (Object.keys(found).length > 0) {
      setErrors(found);
      // Opened down to the cell that failed. "Some rules could not be saved" is not
      // actionable while the message explaining which, and why, is folded away.
      setDetailsOpen(true);
      setOpenCells((current) => [...new Set([...current, ...Object.keys(found)])]);
      toast.error(t("fixErrors"));
      return;
    }

    try {
      await setPermissions.mutateAsync({ id: role.id, rules });
      toast.success(t("saved", { name: role.name }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("saveError")));
    }
  }

  /** The rules with something to configure — the only ones worth a details panel. */
  const grantedCells = catalog.filter(
    (entry) => draftFor(drafts, entry.action, entry.subject).granted,
  );

  // What the folded header reports: how many grants are narrowed, and whether any of them is
  // currently unparseable. Both are counted from the drafts, so they follow an edit rather
  // than what was last saved.
  const narrowedCount = grantedCells.filter((entry) =>
    isDetailed(draftFor(drafts, entry.action, entry.subject)),
  ).length;
  const errorCount = Object.keys(errors).length;

  return (
    <div className="flex flex-col gap-4">
      {role.isLocked ? (
        <div className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>{t("lockedNotice")}</p>
        </div>
      ) : !canEdit ? (
        // Said rather than left to be inferred from controls that do not respond. The grid is
        // still worth reading — "what does this role grant" is the question most people came
        // with — so it renders, and only the saving is withheld.
        <div className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>{t("readOnlyNotice")}</p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40">{t("subject")}</TableHead>
              {ACTIONS.map((action) => (
                <TableHead key={action} className="text-center">
                  {ta(action)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.map((row) => {
              // `manage` is CASL's wildcard, so the four verbs beside it add nothing once
              // it is granted. Said rather than enforced: disabling the cells would hide
              // what the role actually stores, and the operator can see both.
              //
              // Not on the `all` row: "full access to this subject" would be a strange way
              // to describe the row whose own hint already says it overrides everything.
              const manages =
                row.subject !== "all" && draftFor(drafts, "manage", row.subject).granted;

              return (
                <TableRow key={row.subject}>
                  <TableCell className="align-top">
                    <span className="font-medium">{ts(row.subject)}</span>
                    <p className="text-muted-foreground text-xs">
                      {manages ? t("managesAll") : ts(`${row.subject}Hint`)}
                    </p>
                  </TableCell>

                  {ACTIONS.map((action) => {
                    const entry = row.cells.get(action);
                    if (!entry) {
                      return (
                        <TableCell key={action} className="text-muted-foreground/40 text-center">
                          —
                        </TableCell>
                      );
                    }

                    const key = permissionKey(action, row.subject);
                    const draft = draftFor(drafts, action, row.subject);

                    return (
                      <TableCell key={action} className="text-center align-middle">
                        <div className="flex flex-col items-center gap-1">
                          <Checkbox
                            checked={draft.granted}
                            disabled={!canEdit}
                            aria-label={`${ta(action)} ${ts(row.subject)}`}
                            title={entry.description ?? undefined}
                            onCheckedChange={(checked) =>
                              update(action, row.subject, { granted: checked === true })
                            }
                          />
                          {/* A denial is a rule, so it renders as a checked box — which
                              would read as "allowed" with nothing to correct it once the
                              details panel is hidden. The marker is what keeps the grid
                              honest: red for a denial, and a dot for a rule narrowed by
                              conditions or fields. */}
                          {draft.granted && draft.inverted ? (
                            <span className="text-destructive text-[10px] font-medium">
                              {t("deny")}
                            </span>
                          ) : draft.granted && isDetailed(draft) ? (
                            <span
                              className="bg-primary size-1.5 rounded-full"
                              title={t("hasDetails")}
                            />
                          ) : null}
                          {errors[key] ? (
                            <span className="text-destructive text-[10px]">{t("invalid")}</span>
                          ) : null}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {grantedCells.length > 0 ? (
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="rounded-xl border">
          <CollapsibleTrigger className="flex w-full items-start gap-2 p-3 text-start [&[data-state=open]>svg]:rotate-180">
            <ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform" />
            <div className="flex-1">
              {/* A span, not a heading: this is the content of a button, which may only hold
                  phrasing content. */}
              <span className="text-sm font-medium">{t("detailsTitle")}</span>
              <p className="text-muted-foreground text-xs">{t("detailsDescription")}</p>
            </div>
            {/* Counted while closed so folding never hides that a rule is narrowed. The
                tooltip is what says which three things count as narrowing. */}
            {narrowedCount > 0 ? (
              <Badge variant="secondary" title={t("hasDetails")}>
                {narrowedCount}
              </Badge>
            ) : null}
            {errorCount > 0 ? <Badge variant="destructive">{t("invalid")}</Badge> : null}
          </CollapsibleTrigger>

          <CollapsibleContent className="flex flex-col gap-2 border-t p-3">
            {grantedCells.map((entry) => {
              const key = permissionKey(entry.action, entry.subject);
              const draft = draftFor(drafts, entry.action, entry.subject);

              // The subject if this cell can carry a field limit, else null. Held as a const so
              // it stays narrowed inside the handlers below — a type guard on `entry.subject`
              // does not survive into a closure.
              const fieldSubject = acceptsFields(entry.action, entry.subject)
                ? entry.subject
                : null;

              return (
                <Collapsible
                  key={key}
                  open={openCells.includes(key)}
                  onOpenChange={(open) => toggleCell(key, open)}
                  className="rounded-lg border"
                >
                  <CollapsibleTrigger className="flex w-full items-center gap-2 p-3 text-sm [&[data-state=open]>svg]:rotate-180">
                    <ChevronDown className="text-muted-foreground size-4 transition-transform" />
                    <span className="font-medium">
                      {ta(entry.action)} · {ts(entry.subject)}
                    </span>
                    {draft.inverted ? <Badge variant="destructive">{t("deny")}</Badge> : null}
                    {draft.conditionsText.trim() ? (
                      <Badge variant="secondary">{t("conditional")}</Badge>
                    ) : null}
                    {fieldSubject && draft.fieldsText.trim() ? (
                      <Badge variant="outline">{t("fieldLimited")}</Badge>
                    ) : null}
                    {errors[key] ? <Badge variant="destructive">{t("invalid")}</Badge> : null}
                  </CollapsibleTrigger>

                  <CollapsibleContent className="flex flex-col gap-4 border-t p-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${key}-conditions`}>{t("conditions")}</Label>
                      {/* JSON is not localised text, and the placeholders inside it are
                        identifiers — LTR even in a right-to-left layout. */}
                      <Textarea
                        id={`${key}-conditions`}
                        dir="ltr"
                        rows={3}
                        className="font-mono text-xs"
                        placeholder={CONDITIONS_EXAMPLE}
                        disabled={!canEdit}
                        value={draft.conditionsText}
                        onChange={(event) =>
                          update(entry.action, entry.subject, {
                            conditionsText: event.target.value,
                          })
                        }
                      />
                      <p className="text-muted-foreground text-xs">
                        {t("conditionsHint", {
                          userId: token("user.id"),
                          userEmail: token("user.email"),
                        })}
                      </p>
                      {errors[key] ? (
                        <p className="text-destructive text-xs">{errors[key]}</p>
                      ) : null}
                    </div>

                    {/* Only on an update rule: no other action is field-checked, so the
                      control is absent rather than disabled — see `acceptsFields`. */}
                    {fieldSubject ? (
                      <div className="flex flex-col gap-1.5">
                        <Label>{t("fields")}</Label>
                        {/* The registry's own names as toggles, not a text box. A field limit
                          is a set chosen from a known list, and typing it invited the one
                          mistake that cannot be seen afterwards: a misspelled column
                          restricts the rule to a field no request ever names, which revokes
                          the grant while looking like a narrowing. */}
                        <div className="flex flex-wrap gap-1.5" dir="ltr">
                          {WRITABLE_FIELDS[fieldSubject].map((name) => {
                            const chosen = selectedFields(draft).includes(name);

                            return (
                              <Button
                                key={name}
                                type="button"
                                size="sm"
                                variant={chosen ? "default" : "outline"}
                                className="h-7 font-mono text-xs"
                                disabled={!canEdit}
                                aria-pressed={chosen}
                                onClick={() =>
                                  update(entry.action, entry.subject, {
                                    fieldsText: toggleField(draft, fieldSubject, name),
                                  })
                                }
                              >
                                {name}
                              </Button>
                            );
                          })}
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {selectedFields(draft).length === 0 ? t("fieldsAll") : t("fieldsHint")}
                        </p>
                      </div>
                    ) : null}

                    <div className="flex items-start gap-2">
                      <Checkbox
                        id={`${key}-inverted`}
                        checked={draft.inverted}
                        disabled={!canEdit}
                        onCheckedChange={(checked) =>
                          update(entry.action, entry.subject, { inverted: checked === true })
                        }
                      />
                      <div className="grid gap-1 leading-none">
                        <Label htmlFor={`${key}-inverted`}>{t("inverted")}</Label>
                        <p className="text-muted-foreground text-xs">{t("invertedHint")}</p>
                      </div>
                    </div>

                    {draft.inverted ? (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`${key}-reason`}>{t("reason")}</Label>
                        <Input
                          id={`${key}-reason`}
                          placeholder={t("reasonPlaceholder")}
                          disabled={!canEdit}
                          value={draft.reason}
                          onChange={(event) =>
                            update(entry.action, entry.subject, { reason: event.target.value })
                          }
                        />
                        <p className="text-muted-foreground text-xs">{t("reasonHint")}</p>
                      </div>
                    ) : null}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {canEdit ? (
        <div className="flex items-center justify-end gap-2">
          <p className="text-muted-foreground me-auto text-sm" aria-live="polite">
            {dirty ? t("unsaved") : t("upToDate")}
          </p>
          <Button
            variant="outline"
            disabled={!dirty || setPermissions.isPending}
            onClick={() => {
              setDrafts(original);
              setErrors({});
            }}
          >
            <RotateCcw />
            {t("reset")}
          </Button>
          <Button disabled={!dirty || setPermissions.isPending} onClick={() => void onSave()}>
            {setPermissions.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                {tc("loading")}
              </>
            ) : (
              <>
                <Save />
                {tc("save")}
              </>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
