"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
  Snowflake,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import type { ContainerStatus, ContainerType } from "@repo/shipping";
import { asSubject } from "@repo/access";
import { CONTAINER_STATUSES, CONTAINER_TYPES, REEFER_TYPE } from "@repo/shipping";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { useDirection } from "@repo/ui/components/direction-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import type { Container } from "~/services/containers/types";
import { Can, useAbility } from "~/components/providers/ability-provider";
import { useContainers } from "~/services/containers/use-containers";
import { formatKg, inspectionState, todayIso } from "../_lib/format";
import { useDebouncedValue } from "../../users/_lib/use-debounced-value";
import { ContainerFormDialog } from "./container-form-dialog";
import { DeleteContainerDialog } from "./delete-container-dialog";

const PAGE_SIZE = 10;

/** The "no filter" option — a Radix Select cannot hold an empty value. */
const ANY = "all";

/**
 * The fleet.
 *
 * Ordered by container number, as the API returns it: this is a register, and someone
 * holding a box in front of them is looking for *that* number rather than for whatever was
 * added most recently.
 */
export function ContainersTable() {
  const t = useTranslations("Containers");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const locale = useLocale();
  const direction = useDirection();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContainerStatus | typeof ANY>(ANY);
  const [type, setType] = useState<ContainerType | typeof ANY>(ANY);
  const [inspectionDue, setInspectionDue] = useState(false);
  const [skip, setSkip] = useState(0);

  const [formContainer, setFormContainer] = useState<Container | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Container | null>(null);

  const debouncedSearch = useDebouncedValue(search);

  // Narrowing the results while sitting on a later page would otherwise show an empty table
  // for a filter that does have matches — they are just all on page 1.
  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, status, type, inspectionDue]);

  const filters = useMemo(
    () => ({
      skip,
      take: PAGE_SIZE,
      search: debouncedSearch || undefined,
      status: status === ANY ? undefined : status,
      type: type === ANY ? undefined : type,
      inspectionDue: inspectionDue || undefined,
    }),
    [skip, debouncedSearch, status, type, inspectionDue],
  );

  const { data, isPending, isError, isPlaceholderData, refetch } = useContainers(filters);

  // The ability itself, not two booleans: a rule may be conditioned on the row — "only the
  // boxes assigned to you" — so whether the actions menu has anything in it is a question per
  // container, and a coarse check would render a trigger that opens an empty popover.
  const ability = useAbility();

  const containers = data?.containers ?? [];
  const total = data?.pagination.total ?? 0;
  const hasFilters = Boolean(debouncedSearch) || status !== ANY || type !== ANY || inspectionDue;
  const isLastPage = skip + PAGE_SIZE >= total;

  // Computed once per render rather than per row: every row compares against the same day,
  // and asking for "today" ten times invites two of them to disagree over midnight.
  const today = todayIso();

  // Reading order, not physical direction: "previous" points back the way the text came
  // from, so the arrows swap under Arabic.
  const PreviousIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight;

  function openCreate() {
    setFormContainer(null);
    setFormOpen(true);
  }

  function openEdit(container: Container) {
    setFormContainer(container);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 start-3 my-auto size-4" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="ps-9"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => setStatus(value as ContainerStatus | typeof ANY)}
        >
          <SelectTrigger className="lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.allStatuses")}</SelectItem>
            {CONTAINER_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`status.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={type}
          onValueChange={(value) => setType(value as ContainerType | typeof ANY)}
        >
          <SelectTrigger className="lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.allTypes")}</SelectItem>
            {CONTAINER_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`type.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* A toggle rather than a third select: "due for survey" is a question about a date,
            not a value the column can hold, and it is the one an operator asks daily. */}
        <Button
          variant={inspectionDue ? "default" : "outline"}
          aria-pressed={inspectionDue}
          onClick={() => setInspectionDue((current) => !current)}
        >
          <TriangleAlert />
          {t("filters.inspectionDue")}
        </Button>

        {/* Behind `delete`, not `read`: the trash page and the API behind it require the
            delete grant, so anyone the link would 404 on never sees it. */}
        <Can I="delete" a="Container">
          <Button variant="outline" asChild>
            <Link href="/containers/trash">
              <Trash2 />
              {t("trash.link")}
            </Link>
          </Button>
        </Can>

        <Can I="create" a="Container">
          <Button onClick={openCreate}>
            <Plus />
            {t("add")}
          </Button>
        </Can>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.number")}</TableHead>
              <TableHead>{t("columns.equipment")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.location")}</TableHead>
              <TableHead className="text-end">{t("columns.payload")}</TableHead>
              <TableHead>{t("columns.inspection")}</TableHead>
              <TableHead>{t("columns.assignedTo")}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t("columns.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            // Placeholder data is the previous page still on screen while the next one loads;
            // dimming it says "this is stale" without the table collapsing to a spinner and
            // back on every keystroke.
            className={isPlaceholderData ? "opacity-60 transition-opacity" : undefined}
          >
            {isPending ? (
              <LoadingRows />
            ) : isError ? (
              <MessageRow>
                <div className="flex flex-col items-center gap-3">
                  <p>{t("loadError")}</p>
                  <Button variant="outline" size="sm" onClick={() => void refetch()}>
                    {tc("retry")}
                  </Button>
                </div>
              </MessageRow>
            ) : containers.length === 0 ? (
              <MessageRow>{hasFilters ? t("noResults") : t("empty")}</MessageRow>
            ) : (
              containers.map((container) => {
                const inspection = inspectionState(container, today);
                const subject = asSubject("Container", container);
                const canEditThis = ability.can("update", subject);
                const canDeleteThis = ability.can("delete", subject);

                return (
                  <TableRow key={container.id}>
                    {/* A container number is an identifier, not localised text — left to the
                        bidi algorithm it would be reordered in a right-to-left layout. */}
                    <TableCell dir="ltr" className="text-start font-mono text-xs font-medium">
                      {container.containerNumber}
                      {container.isoTypeCode ? (
                        <span className="text-muted-foreground ms-2">{container.isoTypeCode}</span>
                      ) : null}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {/* The one type whose extra field means anything, so it earns an icon
                            rather than being one word among eight. */}
                        {container.type === REEFER_TYPE ? (
                          <Snowflake className="text-muted-foreground size-3.5" />
                        ) : null}
                        <span>{t(`type.${container.type}`)}</span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {t("sizeFeet", { size: container.sizeFt })}
                        {container.type === REEFER_TYPE && container.reeferSetpointC !== null
                          ? ` · ${format.number(container.reeferSetpointC)} °C`
                          : ""}
                      </p>
                    </TableCell>

                    <TableCell>
                      <Badge variant={statusVariant(container.status)}>
                        {t(`status.${container.status}`)}
                      </Badge>
                      <p className="text-muted-foreground text-xs">
                        {t(`condition.${container.condition}`)}
                      </p>
                    </TableCell>

                    <TableCell>
                      {container.unlocode ? (
                        <span dir="ltr" className="font-mono text-xs">
                          {container.unlocode}
                        </span>
                      ) : null}
                      <p className="text-muted-foreground text-xs">
                        {container.depot ?? (container.unlocode ? "" : t("unknownLocation"))}
                      </p>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-end">
                      {formatKg(container.payloadKg, locale)}
                      <p className="text-muted-foreground text-xs">
                        {t("tare", { weight: formatKg(container.tareWeightKg, locale) })}
                      </p>
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {container.nextInspectionOn ? (
                        <span
                          className={
                            inspection === "overdue"
                              ? "text-destructive font-medium"
                              : inspection === "due"
                                ? "font-medium"
                                : undefined
                          }
                        >
                          {/* Fixed to UTC so the server and client renders agree — a
                              browser-local zone would differ from the server's and flip the
                              day around midnight, which React reports as a hydration
                              mismatch. */}
                          {format.dateTime(new Date(`${container.nextInspectionOn}T00:00:00Z`), {
                            dateStyle: "medium",
                            timeZone: "UTC",
                          })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {inspection === "overdue" || inspection === "due" ? (
                        <p
                          className={
                            inspection === "overdue"
                              ? "text-destructive text-xs"
                              : "text-muted-foreground text-xs"
                          }
                        >
                          {t(`inspection.${inspection}`)}
                        </p>
                      ) : null}
                    </TableCell>

                    <TableCell className="text-muted-foreground text-xs">
                      {container.assignedTo ? (
                        (container.assignedTo.name ?? container.assignedTo.email)
                      ) : (
                        <span>{t("unassigned")}</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {canEditThis || canDeleteThis ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t("actions.label")}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEditThis ? (
                              <DropdownMenuItem onClick={() => openEdit(container)}>
                                {t("actions.edit")}
                              </DropdownMenuItem>
                            ) : null}
                            {canDeleteThis ? (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setPendingDelete(container)}
                              >
                                {t("actions.delete")}
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {t("pagination.summary", {
            // Clamped so an empty result reads "0–0 of 0" rather than "1–0".
            from: total === 0 ? 0 : skip + 1,
            to: Math.min(skip + PAGE_SIZE, total),
            total,
          })}
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={skip === 0 || isPending}
            onClick={() => setSkip((current) => Math.max(0, current - PAGE_SIZE))}
          >
            <PreviousIcon />
            {t("pagination.previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isLastPage || isPending}
            onClick={() => setSkip((current) => current + PAGE_SIZE)}
          >
            {t("pagination.next")}
            <NextIcon />
          </Button>
        </div>
      </div>

      {/* Both dialogs are mounted once and driven by state rather than living inside each row
          — a menu that unmounts on click would take its dialog with it, closing it the
          instant it opened. */}
      <ContainerFormDialog open={isFormOpen} onOpenChange={setFormOpen} container={formContainer} />
      <DeleteContainerDialog
        container={pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      />
    </div>
  );
}

/**
 * Status colour, by what the status *means* for the box rather than one shade per value:
 * a damaged or retired container is a problem, one in motion is unremarkable, and an
 * available one is the good case.
 */
function statusVariant(
  status: ContainerStatus,
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "damaged" || status === "retired") return "destructive";
  if (status === "under_repair") return "outline";
  if (status === "available") return "default";
  return "secondary";
}

const COLUMN_COUNT = 8;

function MessageRow({ children }: { children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={COLUMN_COUNT} className="text-muted-foreground py-10 text-center">
        {children}
      </TableCell>
    </TableRow>
  );
}

/** A full page of skeletons, so the table does not resize when the data lands. */
function LoadingRows() {
  return (
    <>
      {Array.from({ length: PAGE_SIZE }, (_, index) => (
        <TableRow key={index}>
          {Array.from({ length: COLUMN_COUNT }, (_, cell) => (
            <TableCell key={cell}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
