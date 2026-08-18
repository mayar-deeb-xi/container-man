"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { useDirection } from "@repo/ui/components/direction-provider";
import { Skeleton } from "@repo/ui/components/skeleton";

import { usePermissions } from "~/services/permissions/use-permissions";
import { useRole } from "~/services/roles/use-role";
import { PermissionMatrix } from "./permission-matrix";

/**
 * Loads the role and the permission catalog, then hands both to the matrix.
 *
 * Kept apart from the matrix so the editor never renders against half its data: the
 * grid's columns come from the catalog and its checkboxes from the role, and a matrix
 * that drew one before the other arrived would flash a grid of empty cells that look
 * like revoked permissions.
 */
export function RoleEditor({ roleId }: { roleId: string }) {
  const t = useTranslations("Roles.detail");
  const tc = useTranslations("Common");
  const tr = useTranslations("Roles");
  const direction = useDirection();

  const role = useRole(roleId);
  const catalog = usePermissions();

  const BackIcon = direction === "rtl" ? ArrowRight : ArrowLeft;

  if (role.isPending || catalog.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (role.isError || catalog.isError || !role.data || !catalog.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground text-sm">{t("loadError")}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void role.refetch();
            void catalog.refetch();
          }}
        >
          {tc("retry")}
        </Button>
      </div>
    );
  }

  const data = role.data;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="self-start" asChild>
          <Link href="/roles">
            <BackIcon />
            {t("back")}
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
          {/* A key is an identifier, so it keeps its own direction in an RTL layout. */}
          <code dir="ltr" className="text-muted-foreground text-sm">
            {data.key}
          </code>
          {data.isSystem ? <Badge variant="secondary">{tr("system")}</Badge> : null}
          {data.isLocked ? <Badge variant="outline">{tr("locked")}</Badge> : null}
        </div>

        {data.description ? (
          <p className="text-muted-foreground text-sm">{data.description}</p>
        ) : null}

        {/* Links into the user list filtered by this role: "who does this affect" is the
            question anyone editing permissions asks next, and the filter already
            answers it. */}
        <Link
          href={`/users?roleKey=${data.key}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"
        >
          <Users className="size-4" />
          {t("holders", { count: data.userCount })}
        </Link>
      </div>

      <PermissionMatrix role={data} catalog={catalog.data} />
    </>
  );
}
