"use client";

import { useState } from "react";
import { Camera, Loader2, MoreHorizontal, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import type { DeliveryDetail, Pallet } from "~/services/deliveries/types";
import { getApiErrorMessage } from "~/lib/axios";
import { useRemovePallet } from "~/services/deliveries/use-pallets";
import { formatKg } from "../../../containers/_lib/format";
import { PalletFormDialog } from "./pallet-form-dialog";
import { PalletPhotosDialog } from "./pallet-photos-dialog";

interface PalletsCardProps {
  delivery: DeliveryDetail;
  canEditPallets: boolean;
  canEditFiles: boolean;
}

/**
 * The rows of the form — one per pallet, in floor order.
 *
 * The columns the paper asked staff to compute or look up are filled by the system
 * and only *shown* here: the tare came from the packing's standard (or the scale, for
 * `special`), and the net is the difference. The photos column is the pallet's own
 * little evidence folder.
 */
export function PalletsCard({ delivery, canEditPallets, canEditFiles }: PalletsCardProps) {
  const t = useTranslations("GoodsIn.pallets");
  const tp = useTranslations("GoodsIn.packing");
  const tcl = useTranslations("GoodsIn.classification");
  const tc = useTranslations("Common");
  const locale = useLocale();

  const [formPallet, setFormPallet] = useState<Pallet | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [photosPallet, setPhotosPallet] = useState<Pallet | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Pallet | null>(null);

  const removePallet = useRemovePallet();

  const photoCount = (palletId: string) =>
    delivery.files.filter((file) => file.palletId === palletId).length;

  function openCreate() {
    setFormPallet(null);
    setFormOpen(true);
  }

  function openEdit(pallet: Pallet) {
    setFormPallet(pallet);
    setFormOpen(true);
  }

  async function onRemove() {
    if (!pendingRemove) return;

    try {
      await removePallet.mutateAsync({ deliveryId: delivery.id, palletId: pendingRemove.id });
      toast.success(t("removeSuccess", { label: pendingRemove.palletLabel }));
      setPendingRemove(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("removeError")));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("title")}</CardTitle>
        {canEditPallets ? (
          <Button size="sm" onClick={openCreate}>
            <Plus />
            {t("add")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {delivery.pallets.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {canEditPallets ? t("emptyEditable") : t("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.label")}</TableHead>
                  <TableHead>{t("columns.packing")}</TableHead>
                  <TableHead>{t("columns.material")}</TableHead>
                  <TableHead className="text-end">{t("columns.gross")}</TableHead>
                  <TableHead className="text-end">{t("columns.tare")}</TableHead>
                  <TableHead className="text-end">{t("columns.net")}</TableHead>
                  <TableHead className="text-end">{t("columns.quantity")}</TableHead>
                  <TableHead>{t("columns.classification")}</TableHead>
                  <TableHead>{t("columns.worker")}</TableHead>
                  <TableHead>{t("columns.photos")}</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("columns.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {delivery.pallets.map((pallet) => (
                  <TableRow key={pallet.id}>
                    <TableCell dir="ltr" className="text-start font-mono text-xs font-medium">
                      {pallet.palletLabel}
                    </TableCell>

                    <TableCell>{tp(pallet.packing)}</TableCell>

                    <TableCell className="max-w-56">
                      <p className="truncate">{pallet.material}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {pallet.weeeCategory !== null
                          ? t("weeeShort", { category: pallet.weeeCategory })
                          : ""}
                        {pallet.weeeCategory !== null && pallet.notice ? " · " : ""}
                        {pallet.notice ?? ""}
                      </p>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-end">
                      {formatKg(pallet.grossWeightKg, locale)}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap text-end">
                      {formatKg(pallet.tareKg, locale)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-end font-medium">
                      {formatKg(pallet.netWeightKg, locale)}
                    </TableCell>
                    <TableCell className="text-end">{pallet.quantityPcs ?? "—"}</TableCell>

                    <TableCell>
                      {pallet.classification ? (
                        <Badge
                          variant={pallet.classification === "waste" ? "secondary" : "default"}
                        >
                          {tcl(pallet.classification)}
                        </Badge>
                      ) : (
                        // An open decision is the one thing that blocks the sign-off,
                        // so it reads as a warning rather than an empty cell.
                        <Badge variant="outline">{t("unclassified")}</Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-muted-foreground text-xs">
                      {pallet.worker.name ?? pallet.worker.email}
                    </TableCell>

                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPhotosPallet(pallet)}
                        aria-label={t("photosFor", { label: pallet.palletLabel })}
                      >
                        <Camera />
                        {photoCount(pallet.id)}
                      </Button>
                    </TableCell>

                    <TableCell>
                      {canEditPallets ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t("actionsLabel")}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(pallet)}>
                              {t("edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setPendingRemove(pallet)}
                            >
                              {t("remove")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <PalletFormDialog
        open={isFormOpen}
        onOpenChange={setFormOpen}
        delivery={delivery}
        pallet={formPallet}
      />

      <PalletPhotosDialog
        delivery={delivery}
        pallet={photosPallet}
        canEditFiles={canEditFiles}
        onOpenChange={(open) => !open && setPhotosPallet(null)}
      />

      <AlertDialog
        open={Boolean(pendingRemove)}
        onOpenChange={(open) => !open && setPendingRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("removeTitle", { label: pendingRemove?.palletLabel ?? "" })}
            </AlertDialogTitle>
            {/* Its photos go with it — a struck line keeps no evidence. */}
            <AlertDialogDescription>{t("removeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removePallet.isPending}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void onRemove();
              }}
              disabled={removePallet.isPending}
              className={cn(buttonVariants({ variant: "destructive" }))}
            >
              {removePallet.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  {t("removing")}
                </>
              ) : (
                t("removeConfirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
