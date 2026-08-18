"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";

import { useCan } from "~/components/providers/ability-provider";
import { getApiErrorMessage } from "~/lib/axios";
import { useRoles } from "~/services/roles/use-roles";
import { useSetUserRoles, useUserRoles } from "~/services/users/use-user-roles";

/** Every role an install has fits on one page of this list; there is no paging here. */
const ROLE_LIMIT = 100;

/**
 * Assigns roles to one user.
 *
 * A checkbox list, not a select: a user holds as many roles as an operator gives them,
 * and their abilities are the union — so the control has to make "two of these" as
 * natural as one. Saving replaces the whole set in a single request.
 */
export function UserRolesCard({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const t = useTranslations("Users.access.roles");
  const tc = useTranslations("Common");

  const assigned = useUserRoles(userId);
  const available = useRoles(useMemo(() => ({ skip: 0, take: ROLE_LIMIT }), []));
  const setRoles = useSetUserRoles();

  // Both permissions, because that is what the endpoint requires: handing out roles is how
  // privilege is granted, so it takes the right to administer accounts *and* the right to
  // administer what a role means. Read into two constants rather than `&&`-ed inline —
  // short-circuiting would skip a hook call and change the hook order between renders.
  const canUpdateUsers = useCan("update", "User");
  const canUpdateRoles = useCan("update", "Role");
  const canAssign = canUpdateUsers && canUpdateRoles && !isSelf;

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const original = useMemo(
    () => new Set((assigned.data ?? []).map((role) => role.id)),
    [assigned.data],
  );

  // Re-seeded whenever the saved assignment changes — after a save, or when a refetch
  // brings in another operator's change. Without this the checkboxes would keep showing
  // the state the card mounted with.
  useEffect(() => {
    setSelected(new Set(original));
  }, [original]);

  const dirty = selected.size !== original.size || [...selected].some((id) => !original.has(id));

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function onSave() {
    try {
      await setRoles.mutateAsync({ id: userId, roleIds: [...selected] });
      toast.success(t("saved"));
    } catch (error) {
      // The backend refuses two things the UI cannot know in advance: stripping the last
      // administrator, and changing your own roles. Its message is the specific one.
      toast.error(getApiErrorMessage(error, t("error")));
    }
  }

  const isPending = assigned.isPending || available.isPending;
  const isError = assigned.isError || available.isError;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{isSelf ? t("selfNotice") : t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {isPending ? (
          <>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-44" />
          </>
        ) : isError ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground text-sm">{t("loadError")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void assigned.refetch();
                void available.refetch();
              }}
            >
              {tc("retry")}
            </Button>
          </div>
        ) : (available.data?.roles.length ?? 0) === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          available.data?.roles.map((role) => (
            <div key={role.id} className="flex items-start gap-2">
              <Checkbox
                id={`role-${role.id}`}
                className="mt-0.5"
                checked={selected.has(role.id)}
                disabled={!canAssign}
                onCheckedChange={(checked) => toggle(role.id, checked === true)}
              />
              <div className="grid gap-0.5 leading-none">
                <Label htmlFor={`role-${role.id}`} className="font-medium">
                  {role.name}
                </Label>
                <p className="text-muted-foreground text-xs">
                  {role.description ?? t("noDescription")}{" "}
                  {/* Straight to the matrix: "what does this role actually grant" is the
                      question anyone assigning one is about to ask. */}
                  <Link href={`/roles/${role.id}`} className="underline">
                    {t("viewPermissions")}
                  </Link>
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {canAssign ? (
        <CardFooter className="justify-end gap-2">
          <Button
            variant="outline"
            disabled={!dirty || setRoles.isPending}
            onClick={() => setSelected(new Set(original))}
          >
            {tc("cancel")}
          </Button>
          <Button disabled={!dirty || setRoles.isPending} onClick={() => void onSave()}>
            {setRoles.isPending ? (
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
        </CardFooter>
      ) : null}
    </Card>
  );
}
