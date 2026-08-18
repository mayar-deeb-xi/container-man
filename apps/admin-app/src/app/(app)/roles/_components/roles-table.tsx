"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, MoreHorizontal, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";

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
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import type { Role } from "~/services/roles/types";
import { Can, useCan } from "~/components/providers/ability-provider";
import { useRoles } from "~/services/roles/use-roles";
import { useDebouncedValue } from "../../users/_lib/use-debounced-value";
import { DeleteRoleDialog } from "./delete-role-dialog";
import { RoleFormDialog } from "./role-form-dialog";

const PAGE_SIZE = 10;

export function RolesTable() {
  const t = useTranslations("Roles");
  const tc = useTranslations("Common");
  const direction = useDirection();

  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);

  const [formRole, setFormRole] = useState<Role | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);

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

  const { data, isPending, isError, isPlaceholderData, refetch } = useRoles(filters);

  // Whether the row menu is worth rendering at all — with neither permission it would
  // be a button that opens an empty popover.
  const canEdit = useCan("update", "Role");
  const canDelete = useCan("delete", "Role");

  const roles = data?.roles ?? [];
  const total = data?.pagination.total ?? 0;
  const isLastPage = skip + PAGE_SIZE >= total;

  // Reading order, not physical direction: "previous" points back the way the text
  // came from, so the arrows swap under Arabic.
  const PreviousIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight;

  function openCreate() {
    setFormRole(null);
    setFormOpen(true);
  }

  function openEdit(role: Role) {
    setFormRole(role);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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

        <Can I="create" a="Role">
          <Button onClick={openCreate}>
            <Plus />
            {t("add")}
          </Button>
        </Can>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.key")}</TableHead>
              <TableHead className="text-end">{t("columns.permissions")}</TableHead>
              <TableHead className="text-end">{t("columns.users")}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t("columns.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            // Placeholder data is the previous page still on screen while the next one
            // loads; dimming it says "this is stale" without the table collapsing to a
            // spinner and back on every keystroke.
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
            ) : roles.length === 0 ? (
              <MessageRow>{debouncedSearch ? t("noResults") : t("empty")}</MessageRow>
            ) : (
              roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    {/* The name links to the matrix rather than opening a dialog: a
                        permission editor is a page's worth of controls, and a URL for it
                        means an operator can link a colleague at one role. */}
                    <Link href={`/roles/${role.id}`} className="hover:underline">
                      {role.name}
                    </Link>
                    {role.isSystem ? (
                      <Badge variant="secondary" className="ms-2">
                        {t("system")}
                      </Badge>
                    ) : null}
                    {role.isLocked ? (
                      <Badge variant="outline" className="ms-2" title={t("lockedHint")}>
                        <Lock className="size-3" />
                        {t("locked")}
                      </Badge>
                    ) : null}
                    {role.description ? (
                      <p className="text-muted-foreground text-xs">{role.description}</p>
                    ) : null}
                  </TableCell>
                  {/* A key is an identifier, not localised text — left to the bidi
                      algorithm it would be reordered in a right-to-left layout. */}
                  <TableCell dir="ltr" className="text-muted-foreground font-mono text-xs">
                    {role.key}
                  </TableCell>
                  <TableCell className="text-end">{role.permissionCount}</TableCell>
                  <TableCell className="text-end">{role.userCount}</TableCell>
                  <TableCell>
                    {canEdit || canDelete ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t("actions.label")}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/roles/${role.id}`}>{t("actions.permissions")}</Link>
                          </DropdownMenuItem>
                          <Can I="update" a="Role">
                            <DropdownMenuItem onClick={() => openEdit(role)}>
                              {t("actions.edit")}
                            </DropdownMenuItem>
                          </Can>
                          <Can I="delete" a="Role">
                            {/* Both refusals the backend would give, shown before the
                                click rather than after: a system role cannot be deleted
                                at all, and one with holders has to be emptied first. */}
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={role.isSystem || role.userCount > 0}
                              title={
                                role.isSystem
                                  ? t("actions.deleteSystem")
                                  : role.userCount > 0
                                    ? t("actions.deleteHeld", { count: role.userCount })
                                    : undefined
                              }
                              onClick={() => setPendingDelete(role)}
                            >
                              {t("actions.delete")}
                            </DropdownMenuItem>
                          </Can>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
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

      {/* Both dialogs are mounted once and driven by state rather than living inside
          each row — a menu that unmounts on click would take its dialog with it,
          closing it the instant it opened. */}
      <RoleFormDialog open={isFormOpen} onOpenChange={setFormOpen} role={formRole} />
      <DeleteRoleDialog
        role={pendingDelete}
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
