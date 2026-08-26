"use client";

import { useRef, useState } from "react";
import { Download, ImageOff, Loader2, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Skeleton } from "@repo/ui/components/skeleton";

import type { DeliveryDetail, DeliveryFile, Pallet } from "~/services/deliveries/types";
import { getApiErrorMessage } from "~/lib/axios";
import {
  saveDeliveryFile,
  useDeleteDeliveryFile,
  useDeliveryFileUrl,
  useUploadDeliveryFile,
} from "~/services/deliveries/use-files";
import { prepareImageUpload } from "../../_lib/compress-image";

/** What the photo input accepts — the API's allowlist, minus PDF, which is not a photo. */
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

interface PalletPhotosDialogProps {
  delivery: DeliveryDetail;
  /** The pallet whose photos are open; `null` closes the dialog. */
  pallet: Pallet | null;
  canEditFiles: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One pallet's photos — the paper form's "photograph every pallet", without its
 * filename convention: files upload straight from the camera roll, the record ties
 * them to the pallet, and the convention appears only on the name a download gets.
 */
export function PalletPhotosDialog({
  delivery,
  pallet,
  canEditFiles,
  onOpenChange,
}: PalletPhotosDialogProps) {
  const t = useTranslations("GoodsIn.photos");
  const uploadFile = useUploadDeliveryFile();
  const inputRef = useRef<HTMLInputElement>(null);

  const photos = pallet
    ? delivery.files.filter((file) => file.palletId === pallet.id)
    : [];

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    // Cleared so choosing the same file twice still fires a change event.
    event.target.value = "";
    if (!picked || !pallet) return;

    try {
      // Downscaled before upload — the deployed platform caps request bodies well
      // below what a phone camera produces.
      const prepared = await prepareImageUpload(picked);
      await uploadFile.mutateAsync({
        deliveryId: delivery.id,
        payload: { file: prepared.file, fileName: prepared.fileName, palletId: pallet.id },
      });
      toast.success(t("uploadSuccess", { label: pallet.palletLabel }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("uploadError")));
    }
  }

  return (
    <Dialog open={Boolean(pallet)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title", { label: pallet?.palletLabel ?? "" })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {canEditFiles ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept={PHOTO_ACCEPT}
              className="hidden"
              onChange={(event) => void onPick(event)}
            />
            <Button
              variant="outline"
              disabled={uploadFile.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {uploadFile.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  {t("uploading")}
                </>
              ) : (
                <>
                  <Upload />
                  {t("upload")}
                </>
              )}
            </Button>
          </div>
        ) : null}

        {photos.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {canEditFiles ? t("emptyEditable") : t("empty")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <PhotoTile
                key={photo.id}
                deliveryId={delivery.id}
                photo={photo}
                canDelete={canEditFiles}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PhotoTile({
  deliveryId,
  photo,
  canDelete,
}: {
  deliveryId: string;
  photo: DeliveryFile;
  canDelete: boolean;
}) {
  const t = useTranslations("GoodsIn.photos");
  const deleteFile = useDeleteDeliveryFile();
  const [isSaving, setSaving] = useState(false);

  // The blob comes through the authenticated API — an <img src> pointed at the endpoint
  // could not carry the cookie flow through axios's refresh logic, an object URL can.
  const { url, isPending, isError } = useDeliveryFileUrl(deliveryId, photo.id);

  async function onSave() {
    setSaving(true);
    try {
      await saveDeliveryFile(deliveryId, photo);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("downloadError")));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    try {
      await deleteFile.mutateAsync({ deliveryId, fileId: photo.id });
      toast.success(t("deleteSuccess"));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("deleteError")));
    }
  }

  return (
    <figure className="group relative overflow-hidden rounded-lg border">
      {isPending ? (
        <Skeleton className="aspect-square w-full" />
      ) : isError || !url ? (
        <div className="text-muted-foreground flex aspect-square w-full items-center justify-center">
          <ImageOff className="size-6" />
        </div>
      ) : (
        // An object URL from the authenticated blob fetch — next/image cannot optimize
        // what it cannot fetch, and this endpoint requires the session cookie.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.downloadName} className="aspect-square w-full object-cover" />
      )}

      <figcaption className="bg-background/80 absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 p-1 backdrop-blur-sm">
        <span dir="ltr" className="truncate font-mono text-[10px]">
          {photo.downloadName}
        </span>
        <span className="flex shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
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
              className="size-7"
              aria-label={t("delete")}
              disabled={deleteFile.isPending}
              onClick={() => void onDelete()}
            >
              <Trash2 />
            </Button>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
}
