"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@repo/ui/components/button";
import { useDirection } from "@repo/ui/components/direction-provider";
import { Skeleton } from "@repo/ui/components/skeleton";

import { useUser } from "~/services/users/use-user";
import { EffectivePermissionsCard } from "./effective-permissions-card";
import { UserRolesCard } from "./user-roles-card";

/**
 * The two halves of "what may this person do": the roles you assign, and the rules those
 * roles resolve to.
 *
 * They are separate cards because they are different kinds of fact. The assignment is a
 * decision an operator makes; the rule set is a *consequence*, computed by the backend
 * from the roles' permissions — which is why it is fetched rather than derived here.
 */
export function UserAccess({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const t = useTranslations("Users.access");
  const tc = useTranslations("Common");
  const direction = useDirection();

  const user = useUser(userId);
  const BackIcon = direction === "rtl" ? ArrowRight : ArrowLeft;

  if (user.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (user.isError || !user.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground text-sm">{t("loadError")}</p>
        <Button variant="outline" size="sm" onClick={() => void user.refetch()}>
          {tc("retry")}
        </Button>
      </div>
    );
  }

  const person = user.data;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="self-start" asChild>
          <Link href="/users">
            <BackIcon />
            {t("back")}
          </Link>
        </Button>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {person.name?.trim() || person.email}
          </h1>
          {/* An email is not localised text — left to the bidi algorithm it would be
              reordered in a right-to-left layout. */}
          <p dir="ltr" className="text-muted-foreground text-start text-sm">
            {person.email}
          </p>
        </div>
      </div>

      <UserRolesCard userId={userId} isSelf={isSelf} />
      <EffectivePermissionsCard userId={userId} />
    </>
  );
}
