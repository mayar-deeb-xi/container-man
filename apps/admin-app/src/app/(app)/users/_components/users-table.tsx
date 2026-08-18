"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { UserRole } from "@repo/auth";
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

import type { AdminUser } from "~/services/users/types";
import { useUsers } from "~/services/users/use-users";
import { useDebouncedValue } from "../_lib/use-debounced-value";
import { DeleteUserDialog } from "./delete-user-dialog";
import { UserFormDialog } from "./user-form-dialog";

const PAGE_SIZE = 10;

/** The role filter's "no filter" option — a Radix Select cannot hold an empty value. */
const ANY_ROLE = "all";

export function UsersTable({ currentUserId }: { currentUserId: string }) {
  const t = useTranslations("Users");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const direction = useDirection();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState<UserRole | typeof ANY_ROLE>(ANY_ROLE);
  const [skip, setSkip] = useState(0);

  const [formUser, setFormUser] = useState<AdminUser | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);

  const debouncedSearch = useDebouncedValue(search);

  // Narrowing the results while sitting on page 4 would otherwise show an empty
  // table for a filter that does have matches — they are just all on page 1.
  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, role]);

  const filters = useMemo(
    () => ({
      skip,
      take: PAGE_SIZE,
      search: debouncedSearch || undefined,
      role: role === ANY_ROLE ? undefined : role,
    }),
    [skip, debouncedSearch, role],
  );

  const { data, isPending, isError, isPlaceholderData, refetch } = useUsers(filters);

  const users = data?.users ?? [];
  const total = data?.pagination.total ?? 0;
  const hasFilters = Boolean(debouncedSearch) || role !== ANY_ROLE;
  const isLastPage = skip + PAGE_SIZE >= total;

  // Reading order, not physical direction: "previous" points back the way the
  // text came from, so the arrows swap under Arabic.
  const PreviousIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight;

  function openCreate() {
    setFormUser(null);
    setFormOpen(true);
  }

  function openEdit(user: AdminUser) {
    setFormUser(user);
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

        <Select
          value={role}
          onValueChange={(value) => setRole(value as UserRole | typeof ANY_ROLE)}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_ROLE}>{t("roles.all")}</SelectItem>
            <SelectItem value="admin">{t("roles.admin")}</SelectItem>
            <SelectItem value="user">{t("roles.user")}</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={openCreate}>
          <Plus />
          {t("add")}
        </Button>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.email")}</TableHead>
              <TableHead>{t("columns.role")}</TableHead>
              <TableHead>{t("columns.created")}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t("columns.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            // Placeholder data is the previous page still on screen while the next
            // one loads; dimming it says "this is stale" without the table
            // collapsing to a spinner and back on every keystroke.
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
            ) : users.length === 0 ? (
              <MessageRow>{hasFilters ? t("noResults") : t("empty")}</MessageRow>
            ) : (
              users.map((user) => {
                const isSelf = user.id === currentUserId;

                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name ?? <span className="text-muted-foreground">—</span>}
                      {isSelf ? (
                        <Badge variant="secondary" className="ms-2">
                          {t("you")}
                        </Badge>
                      ) : null}
                    </TableCell>
                    {/* An email is not localised text — left to the bidi algorithm
                        it would be reordered in a right-to-left layout. */}
                    <TableCell dir="ltr" className="text-start">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === "admin" ? "default" : "outline"}>
                        {t(`roles.${user.role}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {/* Fixed to UTC so the server and client renders agree — a
                          browser-local zone would differ from the server's and
                          flip the day around midnight, which React reports as a
                          hydration mismatch. */}
                      {format.dateTime(new Date(user.createdAt), {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      })}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t("actions.label")}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(user)}>
                            {t("actions.edit")}
                          </DropdownMenuItem>
                          {/* The backend refuses this one; disabling it here means
                              finding that out before clicking rather than after. */}
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={isSelf}
                            title={isSelf ? t("actions.deleteSelf") : undefined}
                            onClick={() => setPendingDelete(user)}
                          >
                            {t("actions.delete")}
                          </DropdownMenuItem>
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

      {/* Both dialogs are mounted once and driven by state rather than living
          inside each row — a menu that unmounts on click would take its dialog
          with it, closing it the instant it opened. */}
      <UserFormDialog open={isFormOpen} onOpenChange={setFormOpen} user={formUser} />
      <DeleteUserDialog
        user={pendingDelete}
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
