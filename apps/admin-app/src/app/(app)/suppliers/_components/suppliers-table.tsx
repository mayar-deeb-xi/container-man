"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { asSubject } from "@repo/access";
import { Button } from "@repo/ui/components/button";
import { useDirection } from "@repo/ui/components/direction-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
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

import type { Supplier } from "~/services/suppliers/types";
import { Can, useAbility } from "~/components/providers/ability-provider";
import { useSuppliers } from "~/services/suppliers/use-suppliers";
import { useDebouncedValue } from "../../users/_lib/use-debounced-value";
import { DeleteSupplierDialog } from "./delete-supplier-dialog";
import { SupplierFormDialog } from "./supplier-form-dialog";

const PAGE_SIZE = 10;

/** The supplier register — codes, names and notes, ordered by code like a code list is. */
export function SuppliersTable() {
  const t = useTranslations("Suppliers");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const direction = useDirection();

  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);

  const [formSupplier, setFormSupplier] = useState<Supplier | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);

  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch]);

  const filters = useMemo(
    () => ({ skip, take: PAGE_SIZE, search: debouncedSearch || undefined }),
    [skip, debouncedSearch],
  );

  const { data, isPending, isError, isPlaceholderData, refetch } = useSuppliers(filters);
  const ability = useAbility();

  const suppliers = data?.suppliers ?? [];
  const total = data?.pagination.total ?? 0;
  const isLastPage = skip + PAGE_SIZE >= total;

  const PreviousIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight;

  function openCreate() {
    setFormSupplier(null);
    setFormOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setFormSupplier(supplier);
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

        <Can I="delete" a="Supplier">
          <Button variant="outline" asChild>
            <Link href="/suppliers/trash">
              <Trash2 />
              {t("trash.link")}
            </Link>
          </Button>
        </Can>

        <Can I="create" a="Supplier">
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
              <TableHead>{t("columns.code")}</TableHead>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.notes")}</TableHead>
              <TableHead>{t("columns.createdAt")}</TableHead>
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
            ) : suppliers.length === 0 ? (
              <MessageRow>{debouncedSearch ? t("noResults") : t("empty")}</MessageRow>
            ) : (
              suppliers.map((supplier) => {
                const subject = asSubject("Supplier", supplier);
                const canEditThis = ability.can("update", subject);
                const canDeleteThis = ability.can("delete", subject);

                return (
                  <TableRow key={supplier.id}>
                    {/* A code is an identifier — LTR and monospaced even under Arabic. */}
                    <TableCell dir="ltr" className="text-start font-mono text-xs font-medium">
                      {supplier.code}
                    </TableCell>
                    <TableCell>{supplier.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-64 truncate text-xs">
                      {supplier.notes ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                      {format.dateTime(new Date(supplier.createdAt), { dateStyle: "medium" })}
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
                              <DropdownMenuItem onClick={() => openEdit(supplier)}>
                                {t("actions.edit")}
                              </DropdownMenuItem>
                            ) : null}
                            {canDeleteThis ? (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setPendingDelete(supplier)}
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

      <SupplierFormDialog open={isFormOpen} onOpenChange={setFormOpen} supplier={formSupplier} />
      <DeleteSupplierDialog
        supplier={pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      />
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
