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

import type { AdminUser } from "~/services/users/types";
import { getApiErrorMessage } from "~/lib/axios";
import { useDeleteUser } from "~/services/users/use-delete-user";
import { displayName } from "./user-form-dialog";

interface DeleteUserDialogProps {
  /** The user awaiting confirmation; `null` closes the dialog. */
  user: AdminUser | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteUserDialog({ user, onOpenChange }: DeleteUserDialogProps) {
  const t = useTranslations("Users.remove");
  const tc = useTranslations("Common");
  const deleteUser = useDeleteUser();

  async function onConfirm() {
    if (!user) return;

    try {
      await deleteUser.mutateAsync(user.id);
      toast.success(t("success", { name: displayName(user) }));
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("error")));
    }
  }

  return (
    <AlertDialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {/* Rendered from the pending user rather than kept in local state, so the
              name in the question can never lag behind the row that was clicked. */}
          <AlertDialogTitle>{t("title", { name: user ? displayName(user) : "" })}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteUser.isPending}>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            // The confirm button closes the dialog on click by default, which would
            // hide the pending state and any error the request comes back with.
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            disabled={deleteUser.isPending}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {deleteUser.isPending ? (
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
