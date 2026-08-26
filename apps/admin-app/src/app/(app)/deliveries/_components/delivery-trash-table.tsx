"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search, Undo2 } from "lucide-react";
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

import { getApiErrorMessage } from "~/lib/axios";
import { useRestoreDelivery } from "~/services/deliveries/use-restore-delivery";
import { useTrashedDeliveries } from "~/services/deliveries/use-trashed-deliveries";
import { useDebouncedValue } from "../../users/_lib/use-debounced-value";
import { utcDate } from "../_lib/format";

const PAGE_SIZE = 10;

/** Mistakenly entered drafts, newest deletion first — restore keeps their number. */
export function DeliveryTrashTable() {
  const t = useTranslations("GoodsIn.trash");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const direction = useDirection();

  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch]);

  const filters = useMemo(
    () => ({ skip, take: PAGE_SIZE, search: debouncedSearch || undefined }),
    [skip, debouncedSearch],
  );

  const { data, isPending, isError, isPlaceholderData, refetch } = useTrashedDeliveries(filters);
  const restoreDelivery = useRestoreDelivery();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const deliveries = data?.deliveries ?? [];
  const total = data?.pagination.total ?? 0;
  const isLastPage = skip + PAGE_SIZE >= total;

  const PreviousIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight;

  async function onRestore(id: string, reference: string) {
    setRestoringId(id);
    try {
      await restoreDelivery.mutateAsync(id);
      toast.success(t("restoreSuccess", { reference }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("restoreError")));
    } finally {
      setRestoringId(null);
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
              <TableHead>{t("columns.reference")}</TableHead>
              <TableHead>{t("columns.deliveredOn")}</TableHead>
              <TableHead>{t("columns.supplier")}</TableHead>
              <TableHead>{t("columns.pallets")}</TableHead>
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
            ) : deliveries.length === 0 ? (
              <MessageRow>{debouncedSearch ? t("noResults") : t("empty")}</MessageRow>
            ) : (
              deliveries.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell dir="ltr" className="text-start font-mono text-xs font-medium">
                    {delivery.reference}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {format.dateTime(utcDate(delivery.deliveredOn), {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    })}
                  </TableCell>
                  <TableCell dir="ltr" className="text-start font-mono text-xs">
                    {delivery.supplier.code}
                  </TableCell>
                  <TableCell>{delivery.palletCount}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                    {format.dateTime(new Date(delivery.deletedAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={restoringId === delivery.id}
                      onClick={() => void onRestore(delivery.id, delivery.reference)}
                    >
                      {restoringId === delivery.id ? (
                        <>
                          <Loader2 className="animate-spin" />
                          {t("restoring")}
                        </>
                      ) : (
                        <>
                          <Undo2 />
                          {t("restore")}
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
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
  );
}

const COLUMN_COUNT = 6;

function MessageRow({ children }: { children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={COLUMN_COUNT} className="text-muted-foreground py-10 text-center">
        {children}
      </TableCell>
    </TableRow>
  );
}

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
