"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, PenLine, Signature, Trash2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { asSubject } from "@repo/access";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { useDirection } from "@repo/ui/components/direction-provider";
import { Skeleton } from "@repo/ui/components/skeleton";

import { useAbility, useFieldAccess } from "~/components/providers/ability-provider";
import { useDelivery } from "~/services/deliveries/use-delivery";
import { formatKg } from "../../../containers/_lib/format";
import { statusVariant, utcDate } from "../../_lib/format";
import { DeleteDeliveryDialog } from "../../_components/delete-delivery-dialog";
import { DeliveryFormDialog } from "../../_components/delivery-form-dialog";
import { DocumentsCard } from "./documents-card";
import { PalletsCard } from "./pallets-card";
import { SignDeliveryDialog } from "./sign-delivery-dialog";

interface DeliveryEditorProps {
  deliveryId: string;
}

/**
 * The record, as the paper form laid it out: header on top, one row per pallet, the
 * papers alongside, the signature at the end. While it is a draft everything is
 * editable (within the caller's rules); the moment it is signed the same layout is a
 * read-only document, which is the point — the signed form *is* the record.
 */
export function DeliveryEditor({ deliveryId }: DeliveryEditorProps) {
  const t = useTranslations("GoodsIn.detail");
  const ts = useTranslations("GoodsIn");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const locale = useLocale();
  const direction = useDirection();

  const { data: delivery, isPending, isError, refetch } = useDelivery(deliveryId);
  const ability = useAbility();

  const [isEditOpen, setEditOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [isSignOpen, setSignOpen] = useState(false);

  const canWriteField = useFieldAccess("Delivery", delivery);

  const BackIcon = direction === "rtl" ? ArrowRight : ArrowLeft;

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !delivery) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-muted-foreground">{t("loadError")}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          {tc("retry")}
        </Button>
      </div>
    );
  }

  const isDraft = delivery.status === "draft";
  const subject = asSubject("Delivery", delivery);
  const canUpdate = ability.can("update", subject);

  // The three write surfaces a rule can grant separately: the header fields, the
  // pallet rows, and the attached files. Everything below keys off these.
  const canEditHeader = isDraft && canUpdate;
  const canEditPallets = isDraft && canUpdate && canWriteField("pallets");
  const canEditFiles = isDraft && canUpdate && canWriteField("files");
  const canDelete = isDraft && ability.can("delete", subject);
  // Signing is a *field* of the delivery, like the pallets: a scale-station rule
  // narrowed to rows and photos fills the record in but is never offered the pen.
  const canSign = isDraft && canUpdate && canWriteField("sign");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="self-start" asChild>
          <Link href="/deliveries">
            <BackIcon />
            {t("back")}
          </Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 dir="ltr" className="font-mono text-2xl font-semibold tracking-tight">
              {delivery.reference}
            </h1>
            <Badge variant={statusVariant(delivery.status)}>
              {ts(`status.${delivery.status}`)}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            {canEditHeader ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <PenLine />
                {t("editHeader")}
              </Button>
            ) : null}
            {canDelete ? (
              <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                <Trash2 />
                {t("delete")}
              </Button>
            ) : null}
            {canSign ? (
              <Button onClick={() => setSignOpen(true)}>
                <Signature />
                {t("sign")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryItem label={t("summary.supplier")}>
            <span dir="ltr" className="font-mono">
              {delivery.supplier.code}
            </span>
          </SummaryItem>
          <SummaryItem label={t("summary.deliveredOn")}>
            {format.dateTime(utcDate(delivery.deliveredOn), {
              dateStyle: "medium",
              timeZone: "UTC",
            })}
          </SummaryItem>
          <SummaryItem label={t("summary.lotNo")}>{delivery.lotNo ?? "—"}</SummaryItem>
          <SummaryItem label={t("summary.pallets")}>{delivery.palletCount}</SummaryItem>
          <SummaryItem label={t("summary.netWeight")}>
            {formatKg(delivery.totalNetWeightKg, locale)}
          </SummaryItem>
        </CardContent>
      </Card>

      {/* The signature line, once there is one — who closed the record, and when. */}
      {delivery.signedBy && delivery.signedAt ? (
        <p className="text-muted-foreground text-sm">
          {t("signedLine", {
            name: delivery.signedBy.name ?? delivery.signedBy.email,
            date: format.dateTime(new Date(delivery.signedAt), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </p>
      ) : null}

      <PalletsCard delivery={delivery} canEditPallets={canEditPallets} canEditFiles={canEditFiles} />

      <DocumentsCard
        delivery={delivery}
        canToggleDocuments={canEditHeader && canWriteField("documents")}
        canEditFiles={canEditFiles}
      />

      <DeliveryFormDialog open={isEditOpen} onOpenChange={setEditOpen} delivery={delivery} />
      <DeleteDeliveryDialog
        delivery={isDeleteOpen ? delivery : null}
        onOpenChange={(open) => !open && setDeleteOpen(false)}
        redirectTo="/deliveries"
      />
      <SignDeliveryDialog
        delivery={isSignOpen ? delivery : null}
        onOpenChange={(open) => !open && setSignOpen(false)}
      />
    </div>
  );
}

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}
