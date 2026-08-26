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

import type { Supplier } from "~/services/suppliers/types";
import { getApiErrorMessage, isConflict } from "~/lib/axios";
import { useDeleteSupplier } from "~/services/suppliers/use-delete-supplier";

interface DeleteSupplierDialogProps {
  supplier: Supplier | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteSupplierDialog({ supplier, onOpenChange }: DeleteSupplierDialogProps) {
  const t = useTranslations("Suppliers.remove");
  const tc = useTranslations("Common");
  const deleteSupplier = useDeleteSupplier();

  async function onConfirm() {
    if (!supplier) return;

    try {
      await deleteSupplier.mutateAsync(supplier.id);
      toast.success(t("success", { code: supplier.code }));
      onOpenChange(false);
    } catch (error) {
      // The one refusal worth its own words: a supplier with recorded deliveries is
      // pinned by them, and "something went wrong" would send the operator hunting.
      if (isConflict(error)) {
        toast.error(t("hasDeliveries", { code: supplier.code }));
        return;
      }
      toast.error(getApiErrorMessage(error, t("error")));
    }
  }

  return (
    <AlertDialog open={Boolean(supplier)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { code: supplier?.code ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteSupplier.isPending}>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            disabled={deleteSupplier.isPending}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {deleteSupplier.isPending ? (
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
