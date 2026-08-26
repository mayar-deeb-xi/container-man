"use client";

import { useRef, useState } from "react";
import { Download, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { GoodsDocType } from "@repo/goods-in";
import { GOODS_DOC_TYPES } from "@repo/goods-in";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Checkbox } from "@repo/ui/components/checkbox";

import type { DeliveryDetail, DeliveryFile } from "~/services/deliveries/types";
import { getApiErrorMessage } from "~/lib/axios";
import {
  saveDeliveryFile,
  useDeleteDeliveryFile,
  useUploadDeliveryFile,
} from "~/services/deliveries/use-files";
import { useUpdateDelivery } from "~/services/deliveries/use-update-delivery";
import { prepareImageUpload } from "../../_lib/compress-image";

/** Scans arrive as photos or PDFs — the API's whole allowlist applies here. */
const SCAN_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

interface DocumentsCardProps {
  delivery: DeliveryDetail;
  canToggleDocuments: boolean;
  canEditFiles: boolean;
}

/**
 * The accompanying papers — the form's "Documents attached (Nr.)" without the numbered
 * legend, and with the papers themselves alongside.
 *
 * Two independent facts per document type, on purpose: the checkbox records what
 * physically arrived with the lorry, the scan is the evidence filed against it. A CMR
 * can have arrived and not (yet) been scanned, and both states should be visible.
 */
export function DocumentsCard({ delivery, canToggleDocuments, canEditFiles }: DocumentsCardProps) {
  const t = useTranslations("GoodsIn.documents");
  const tdoc = useTranslations("GoodsIn.docTypes");
  const updateDelivery = useUpdateDelivery();

  async function onToggle(docType: GoodsDocType, next: boolean) {
    const documents = next
      ? [...delivery.documents, docType]
      : delivery.documents.filter((value) => value !== docType);

    try {
      await updateDelivery.mutateAsync({ id: delivery.id, payload: { documents } });
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("toggleError")));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {GOODS_DOC_TYPES.map((docType) => (
          <DocumentRow
            key={docType}
            delivery={delivery}
            docType={docType}
            label={tdoc(docType)}
            arrived={delivery.documents.includes(docType)}
            scans={delivery.files.filter((file) => file.docType === docType)}
            canToggle={canToggleDocuments}
            disabled={updateDelivery.isPending}
            canEditFiles={canEditFiles}
            onToggle={(next) => void onToggle(docType, next)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function DocumentRow({
  delivery,
  docType,
  label,
  arrived,
  scans,
  canToggle,
  disabled,
  canEditFiles,
  onToggle,
}: {
  delivery: DeliveryDetail;
  docType: GoodsDocType;
  label: string;
  arrived: boolean;
  scans: DeliveryFile[];
  canToggle: boolean;
  disabled: boolean;
  canEditFiles: boolean;
  onToggle: (next: boolean) => void;
}) {
  const t = useTranslations("GoodsIn.documents");
  const uploadFile = useUploadDeliveryFile();
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;

    try {
      // Photographed scans shrink like pallet photos; a real PDF passes through as-is.
      const prepared = await prepareImageUpload(picked);
      await uploadFile.mutateAsync({
        deliveryId: delivery.id,
        payload: { file: prepared.file, fileName: prepared.fileName, docType },
      });
      toast.success(t("uploadSuccess", { doc: label }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("uploadError")));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <label className="flex min-w-40 flex-1 items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={arrived}
          disabled={!canToggle || disabled}
          onCheckedChange={(next) => onToggle(next === true)}
        />
        {label}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {scans.map((scan) => (
          <ScanChip key={scan.id} deliveryId={delivery.id} scan={scan} canDelete={canEditFiles} />
        ))}

        {canEditFiles ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={SCAN_ACCEPT}
              className="hidden"
              onChange={(event) => void onPick(event)}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={uploadFile.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {uploadFile.isPending ? <Loader2 className="animate-spin" /> : <Paperclip />}
              {t("attachScan")}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ScanChip({
  deliveryId,
  scan,
  canDelete,
}: {
  deliveryId: string;
  scan: DeliveryFile;
  canDelete: boolean;
}) {
  const t = useTranslations("GoodsIn.documents");
  const deleteFile = useDeleteDeliveryFile();
  const [isSaving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    try {
      await saveDeliveryFile(deliveryId, scan);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("downloadError")));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    try {
      await deleteFile.mutateAsync({ deliveryId, fileId: scan.id });
      toast.success(t("deleteSuccess"));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("deleteError")));
    }
  }

  return (
    <span className="bg-muted/50 flex items-center gap-1 rounded-full border px-2 py-1">
      <FileText className="text-muted-foreground size-3.5" />
      <span dir="ltr" className="max-w-40 truncate font-mono text-[11px]">
        {scan.downloadName}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label={t("download")}
        disabled={isSaving}
        onClick={() => void onSave()}
      >
        {isSaving ? <Loader2 className="animate-spin" /> : <Download />}
      </Button>
      {canDelete ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={t("delete")}
          disabled={deleteFile.isPending}
          onClick={() => void onDelete()}
        >
          <Trash2 />
        </Button>
      ) : null}
    </span>
  );
}
