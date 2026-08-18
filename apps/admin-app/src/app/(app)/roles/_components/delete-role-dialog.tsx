"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { buttonVariants } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import type { Role } from "~/services/roles/types";
import { getApiErrorMessage } from "~/lib/axios";
import { useDeleteRole } from "~/services/roles/use-delete-role";

interface DeleteRoleDialogProps {
  /** The role awaiting confirmation; `null` closes the dialog. */
  role: Role | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteRoleDialog({ role, onOpenChange }: DeleteRoleDialogProps) {
  const t = useTranslations("Roles.remove");
  const tc = useTranslations("Common");
  const deleteRole = useDeleteRole();

  async function onConfirm() {
    if (!role) return;

    try {
      await deleteRole.mutateAsync(role.id);
      toast.success(t("success", { name: role.name }));
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("error")));
    }
  }

  return (
    <AlertDialog open={Boolean(role)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {/* Rendered from the pending role rather than kept in local state, so the name
              in the question can never lag behind the row that was clicked. */}
          <AlertDialogTitle>{t("title", { name: role?.name ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteRole.isPending}>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            // The confirm button closes the dialog on click by default, which would hide
            // the pending state and any error the request comes back with.
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            disabled={deleteRole.isPending}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {deleteRole.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                {t("deleting")}
              </>
            ) : (
              t("confirm")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
