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

import type { Container } from "~/services/containers/types";
import { getApiErrorMessage } from "~/lib/axios";
import { useDeleteContainer } from "~/services/containers/use-delete-container";

interface DeleteContainerDialogProps {
  /** The container awaiting confirmation; `null` closes the dialog. */
  container: Container | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteContainerDialog({ container, onOpenChange }: DeleteContainerDialogProps) {
  const t = useTranslations("Containers.remove");
  const tc = useTranslations("Common");
  const deleteContainer = useDeleteContainer();

  async function onConfirm() {
    if (!container) return;

    try {
      await deleteContainer.mutateAsync(container.id);
      toast.success(t("success", { number: container.containerNumber }));
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("error")));
    }
  }

  return (
    <AlertDialog open={Boolean(container)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {/* Rendered from the pending container rather than kept in local state, so the
              number in the question can never lag behind the row that was clicked. */}
          <AlertDialogTitle>
            {t("title", { number: container?.containerNumber ?? "" })}
          </AlertDialogTitle>
          {/* Says what deleting is *not* for: a scrapped box is `retired`, which keeps it in
              the fleet list where its history still resolves. */}
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteContainer.isPending}>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            // The confirm button closes the dialog on click by default, which would hide the
            // pending state and any error the request comes back with.
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            disabled={deleteContainer.isPending}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {deleteContainer.isPending ? (
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
