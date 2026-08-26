"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@repo/ui/components/button";
import { useDirection } from "@repo/ui/components/direction-provider";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import type { TrashedContainer } from "~/services/containers/types";
import { getApiErrorMessage, isConflict } from "~/lib/axios";
import { useRestoreContainer } from "~/services/containers/use-restore-container";
import { useTrashedContainers } from "~/services/containers/use-trashed-containers";
import { useDebouncedValue } from "../../users/_lib/use-debounced-value";

const PAGE_SIZE = 10;

/**
 * The trash — soft-deleted rows, newest deletion first, as the API returns them.
 *
 * No per-row ability check before showing the restore button: the API scopes this list by
 * the caller's `delete` rules, so every row that arrives is one the caller may restore.
 * Restore is one click with no confirmation — it is not destructive, and its undo is the
 * delete action sitting right there in the register.
 */
export function TrashTable() {
  const t = useTranslations("Containers.trash");
  // The vocabulary and paging strings belong to the register and are reused, not copied:
  // a container type must read the same in the trash as it does in the fleet.
  const tContainers = useTranslations("Containers");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const direction = useDirection();

  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);

  const debouncedSearch = useDebouncedValue(search);

  // Narrowing the results while sitting on a later page would otherwise show an empty
  // table for a search that does have matches — they are just all on page 1.
  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch]);

  const filters = useMemo(
    () => ({ skip, take: PAGE_SIZE, search: debouncedSearch || undefined }),
    [skip, debouncedSearch],
  );

  const { data, isPending, isError, isPlaceholderData, refetch } = useTrashedContainers(filters);
  const restore = useRestoreContainer();

  const containers = data?.containers ?? [];
  const total = data?.pagination.total ?? 0;
  const isLastPage = skip + PAGE_SIZE >= total;

  const PreviousIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight;

  async function onRestore(container: TrashedContainer) {
    try {
      await restore.mutateAsync(container.id);
      toast.success(t("restoreSuccess", { number: container.containerNumber }));
    } catch (error) {
      // The one failure worth its own sentence: the number was re-entered while this row
      // sat in the trash, and the caller has to free it before the restore can land.
      if (isConflict(error)) {
        toast.error(t("restoreConflict", { number: container.containerNumber }));
        return;
      }
      toast.error(getApiErrorMessage(error, t("restoreError")));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 start-3 my-auto size-4" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="ps-9"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.number")}</TableHead>
              <TableHead>{t("columns.equipment")}</TableHead>
              <TableHead>{t("columns.location")}</TableHead>
              <TableHead>{t("columns.deletedAt")}</TableHead>
              <TableHead className="w-32">
                <span className="sr-only">{t("columns.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
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
              <MessageRow>{debouncedSearch ? t("noResults") : t("empty")}</MessageRow>
            ) : (
              containers.map((container) => {
                const isRestoringThis = restore.isPending && restore.variables === container.id;

                return (
                  <TableRow key={container.id}>
                    <TableCell dir="ltr" className="text-start font-mono text-xs font-medium">
                      {container.containerNumber}
                      {container.isoTypeCode ? (
                        <span className="text-muted-foreground ms-2">{container.isoTypeCode}</span>
                      ) : null}
                    </TableCell>

                    <TableCell>
                      {tContainers(`type.${container.type}`)}
                      <p className="text-muted-foreground text-xs">
                        {tContainers("sizeFeet", { size: container.sizeFt })}
                      </p>
                    </TableCell>

                    <TableCell className="text-muted-foreground text-xs">
                      {container.depot ?? "—"}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {/* A full timestamp, unlike the register's date-only columns: "which
                          of these is the one I just deleted?" is answered by the hour. */}
                      {format.dateTime(new Date(container.deletedAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>

                    <TableCell className="text-end">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restore.isPending}
                        onClick={() => void onRestore(container)}
                      >
                        {isRestoringThis ? (
                          <>
                            <Loader2 className="animate-spin" />
                            {t("restoring")}
                          </>
                        ) : (
                          <>
                            <RotateCcw />
                            {t("restore")}
                          </>
                        )}
                      </Button>
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
          {tContainers("pagination.summary", {
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
            {tContainers("pagination.previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isLastPage || isPending}
            onClick={() => setSkip((current) => current + PAGE_SIZE)}
          >
            {tContainers("pagination.next")}
            <NextIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

const COLUMN_COUNT = 5;

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
