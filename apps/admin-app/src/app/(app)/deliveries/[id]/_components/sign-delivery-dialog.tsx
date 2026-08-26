"use client";

import { Loader2, TriangleAlert } from "lucide-react";
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

import type { DeliveryDetail } from "~/services/deliveries/types";
import { getApiErrorMessage } from "~/lib/axios";
import { useSignDelivery } from "~/services/deliveries/use-sign-delivery";
import { formatKg } from "../../../containers/_lib/format";

interface SignDeliveryDialogProps {
  /** The delivery awaiting sign-off; `null` closes the dialog. */
  delivery: DeliveryDetail | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * The signature at the bottom of the form — as a decision, spelled out.
 *
 * The summary is plain language on purpose: what is being signed, in numbers, plus
 * exactly what still blocks it. The confirm stays disabled while the record is empty
 * or a pallet is unclassified, because the API refuses both — the dialog explains
 * *before* rather than relaying a 400 after. There is no unsign; it says so.
 */
export function SignDeliveryDialog({ delivery, onOpenChange }: SignDeliveryDialogProps) {
  const t = useTranslations("GoodsIn.signOff");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const signDelivery = useSignDelivery();

  const unclassified = (delivery?.pallets ?? []).filter(
    (pallet) => pallet.classification === null,
  );
  const isEmpty = (delivery?.pallets.length ?? 0) === 0;
  const isBlocked = isEmpty || unclassified.length > 0;

  async function onConfirm() {
    if (!delivery) return;

    try {
      const signed = await signDelivery.mutateAsync(delivery.id);
      toast.success(t("success", { reference: signed.reference }));
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("error")));
    }
  }

  return (
    <AlertDialog open={Boolean(delivery)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { reference: delivery?.reference ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("summary", {
              pallets: delivery?.pallets.length ?? 0,
              weight: formatKg(delivery?.totalNetWeightKg ?? 0, locale),
              documents: delivery?.documents.length ?? 0,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isEmpty ? (
          <Blocker>{t("blockedEmpty")}</Blocker>
        ) : unclassified.length > 0 ? (
          <Blocker>
            {t("blockedUnclassified", {
              labels: unclassified.map((pallet) => pallet.palletLabel).join(", "),
            })}
          </Blocker>
        ) : (
          <p className="text-muted-foreground text-sm">{t("irreversible")}</p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={signDelivery.isPending}>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            disabled={isBlocked || signDelivery.isPending}
          >
            {signDelivery.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                {t("signing")}
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

function Blocker({ children }: { children: React.ReactNode }) {
  return (
    <p className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
