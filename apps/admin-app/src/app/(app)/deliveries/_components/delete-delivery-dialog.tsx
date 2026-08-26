"use client";

import { useRouter } from "next/navigation";
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

import type { Delivery } from "~/services/deliveries/types";
import { getApiErrorMessage } from "~/lib/axios";
import { useDeleteDelivery } from "~/services/deliveries/use-delete-delivery";

interface DeleteDeliveryDialogProps {
  delivery: Delivery | null;
  onOpenChange: (open: boolean) => void;
  /** Set when the dialog lives on the record itself, which stops existing on confirm. */
  redirectTo?: string;
}

/** Drafts only — a signed record cannot be deleted, and the API enforces that too. */
export function DeleteDeliveryDialog({
  delivery,
  onOpenChange,
  redirectTo,
}: DeleteDeliveryDialogProps) {
  const t = useTranslations("GoodsIn.remove");
  const tc = useTranslations("Common");
  const router = useRouter();
  const deleteDelivery = useDeleteDelivery();

  async function onConfirm() {
    if (!delivery) return;

    try {
      await deleteDelivery.mutateAsync(delivery.id);
      toast.success(t("success", { reference: delivery.reference }));
      onOpenChange(false);
      if (redirectTo) router.push(redirectTo);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("error")));
    }
  }

  return (
    <AlertDialog open={Boolean(delivery)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("title", { reference: delivery?.reference ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteDelivery.isPending}>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            disabled={deleteDelivery.isPending}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {deleteDelivery.isPending ? (
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
