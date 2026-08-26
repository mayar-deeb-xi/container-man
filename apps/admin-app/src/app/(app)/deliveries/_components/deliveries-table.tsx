"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import type { DeliveryStatus } from "@repo/goods-in";
import { asSubject } from "@repo/access";
import { DELIVERY_STATUSES } from "@repo/goods-in";
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

import type { Delivery } from "~/services/deliveries/types";
import { Can, useAbility } from "~/components/providers/ability-provider";
import { useDeliveries } from "~/services/deliveries/use-deliveries";
import { useSupplierOptions } from "~/services/deliveries/use-supplier-options";
import { formatKg } from "../../containers/_lib/format";
import { useDebouncedValue } from "../../users/_lib/use-debounced-value";
import { statusVariant, utcDate } from "../_lib/format";
import { DeleteDeliveryDialog } from "./delete-delivery-dialog";
import { DeliveryFormDialog } from "./delivery-form-dialog";

const PAGE_SIZE = 10;

/** The "no filter" option — a Radix Select cannot hold an empty value. */
const ANY = "all";

/** The goods-in register, newest first — what just came in is what someone is looking for. */
export function DeliveriesTable() {
  const t = useTranslations("GoodsIn");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const locale = useLocale();
  const direction = useDirection();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DeliveryStatus | typeof ANY>(ANY);
  const [supplierId, setSupplierId] = useState<string>(ANY);
  const [deliveredFrom, setDeliveredFrom] = useState("");
  const [deliveredTo, setDeliveredTo] = useState("");
  const [skip, setSkip] = useState(0);

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Delivery | null>(null);

  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, status, supplierId, deliveredFrom, deliveredTo]);

  const filters = useMemo(
    () => ({
      skip,
      take: PAGE_SIZE,
      search: debouncedSearch || undefined,
      status: status === ANY ? undefined : status,
      supplierId: supplierId === ANY ? undefined : supplierId,
      deliveredFrom: deliveredFrom || undefined,
      deliveredTo: deliveredTo || undefined,
    }),
    [skip, debouncedSearch, status, supplierId, deliveredFrom, deliveredTo],
  );

  const { data, isPending, isError, isPlaceholderData, refetch } = useDeliveries(filters);
  const supplierOptions = useSupplierOptions();
  const ability = useAbility();

  const deliveries = data?.deliveries ?? [];
  const total = data?.pagination.total ?? 0;
  const hasFilters =
    Boolean(debouncedSearch) ||
    status !== ANY ||
    supplierId !== ANY ||
    Boolean(deliveredFrom) ||
    Boolean(deliveredTo);
  const isLastPage = skip + PAGE_SIZE >= total;

  const PreviousIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight;

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
          onValueChange={(value) => setStatus(value as DeliveryStatus | typeof ANY)}
        >
          <SelectTrigger className="lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.allStatuses")}</SelectItem>
            {DELIVERY_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`status.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger className="lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.allSuppliers")}</SelectItem>
            {(supplierOptions.data ?? []).map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Can I="delete" a="Delivery">
          <Button variant="outline" asChild>
            <Link href="/deliveries/trash">
              <Trash2 />
              {t("trash.link")}
            </Link>
          </Button>
        </Can>

        <Can I="create" a="Delivery">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("add")}
          </Button>
        </Can>
      </div>

      {/* The register is asked by week and by month, so the date bounds sit on their own
          row — two dates crammed beside five other controls would wrap unreadably. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          {t("filters.deliveredFrom")}
          <Input
            type="date"
            dir="ltr"
            value={deliveredFrom}
            onChange={(event) => setDeliveredFrom(event.target.value)}
            className="w-40"
          />
        </label>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          {t("filters.deliveredTo")}
          <Input
            type="date"
            dir="ltr"
            value={deliveredTo}
            onChange={(event) => setDeliveredTo(event.target.value)}
            className="w-40"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.reference")}</TableHead>
              <TableHead>{t("columns.deliveredOn")}</TableHead>
              <TableHead>{t("columns.supplier")}</TableHead>
              <TableHead>{t("columns.lotNo")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="text-end">{t("columns.pallets")}</TableHead>
              <TableHead className="text-end">{t("columns.netWeight")}</TableHead>
              <TableHead className="w-12">
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
              <MessageRow>{hasFilters ? t("noResults") : t("empty")}</MessageRow>
            ) : (
              deliveries.map((delivery) => {
                const subject = asSubject("Delivery", delivery);
                // Deleting is for mistaken *drafts*; a signed row never offers it.
                const canDeleteThis =
                  delivery.status === "draft" && ability.can("delete", subject);

                return (
                  <TableRow key={delivery.id}>
                    <TableCell dir="ltr" className="text-start font-mono text-xs font-medium">
                      <Link href={`/deliveries/${delivery.id}`} className="hover:underline">
                        {delivery.reference}
                      </Link>
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

                    <TableCell className="text-muted-foreground text-xs">
                      {delivery.lotNo ?? "—"}
                    </TableCell>

                    <TableCell>
                      <Badge variant={statusVariant(delivery.status)}>
                        {t(`status.${delivery.status}`)}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-end">{delivery.palletCount}</TableCell>

                    <TableCell className="whitespace-nowrap text-end">
                      {formatKg(delivery.totalNetWeightKg, locale)}
                    </TableCell>

                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t("actions.label")}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/deliveries/${delivery.id}`}>{t("actions.open")}</Link>
                          </DropdownMenuItem>
                          {canDeleteThis ? (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setPendingDelete(delivery)}
                            >
                              {t("actions.delete")}
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
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

      <DeliveryFormDialog open={isCreateOpen} onOpenChange={setCreateOpen} />
      <DeleteDeliveryDialog
        delivery={pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      />
    </div>
  );
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
